/**
 * Per-instance LRU for hot read responses.
 *
 * Keys always include the project's `cms_version`, so a publish makes every
 * stale entry unreachable and no active eviction is needed. Positive-only: 404s
 * are never cached, so a flood of requests for empty tenants can't evict real
 * content.
 *
 * Hand-rolled rather than pulling in `lru-cache`. This is ~30 lines and only
 * `@velastack/cms/backend` ever touches it — a dependency here would be
 * installed by every consumer of the components and the SSR read path too,
 * none of whom run a backend.
 *
 * In a clustered deployment each worker keeps its own cache; cross-worker hit
 * rate is recovered by the CDN in front, which the `Cache-Control` and `ETag`
 * headers are sized for.
 */
export type ReadCacheKey = {
	projectId: string;
	cmsVersion: number;
	scope: string;
};

export type ReadCache = {
	get(key: ReadCacheKey): string | undefined;
	set(key: ReadCacheKey, value: string): void;
	clear(): void;
};

export type ReadCacheOptions = {
	/** Entries retained before the least-recently-used is evicted. */
	max?: number;
	/** Per-entry lifetime in milliseconds. */
	ttlMs?: number;
};

const buildKey = ({ projectId, cmsVersion, scope }: ReadCacheKey): string =>
	`${projectId}:${cmsVersion}:${scope}`;

export const createReadCache = (options: ReadCacheOptions = {}): ReadCache => {
	const max = options.max ?? 50_000;
	const ttlMs = options.ttlMs ?? 5 * 60 * 1000;
	// A Map iterates in insertion order, so the first key is the oldest. `get`
	// re-inserts on a hit, which is what makes the eviction order LRU rather
	// than FIFO.
	const entries = new Map<string, { value: string; expiresAt: number }>();

	return {
		get(key) {
			const k = buildKey(key);
			const hit = entries.get(k);
			if (!hit) return undefined;
			if (hit.expiresAt <= Date.now()) {
				entries.delete(k);
				return undefined;
			}
			entries.delete(k);
			entries.set(k, hit);
			return hit.value;
		},
		set(key, value) {
			const k = buildKey(key);
			entries.delete(k);
			entries.set(k, { value, expiresAt: Date.now() + ttlMs });
			while (entries.size > max) {
				const oldest = entries.keys().next();
				if (oldest.done) break;
				entries.delete(oldest.value);
			}
		},
		clear() {
			entries.clear();
		}
	};
};
