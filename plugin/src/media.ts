import fs from 'node:fs';
import path from 'node:path';

/**
 * Backend serves uploaded files at the endpoint origin (`/uploads/<filename>`)
 * via SvelteKit's static handler — confirmed in `cms.velastack/_store.ts`. The
 * project-scoped CMS endpoint (`/v1/projects/PID/cms`) only governs the API,
 * not the upload path. So `uploadsBase` is the bare origin + `/uploads`.
 */
export const deriveUploadsBase = (endpoint: string): string => {
	const url = new URL(endpoint);
	return `${url.origin}/uploads`;
};

const RELATIVE_UPLOADS_RE = /^\/uploads\/([^/?#]+)$/;

/**
 * Walk an arbitrary deserialized JSON value and collect every media filename
 * referenced as a string — either as a relative `/uploads/<file>` path or an
 * absolute `<uploadsBase>/<file>` URL. Cycle-safe via a WeakSet.
 */
export const extractMediaUrls = (value: unknown, uploadsBase: string): Set<string> => {
	const out = new Set<string>();
	const seen = new WeakSet<object>();
	const prefix = `${uploadsBase}/`;
	const walk = (v: unknown): void => {
		if (typeof v === 'string') {
			const m = RELATIVE_UPLOADS_RE.exec(v);
			if (m) {
				out.add(m[1]);
				return;
			}
			if (v.startsWith(prefix)) {
				const rest = v.slice(prefix.length).split(/[?#]/)[0];
				if (rest && !rest.includes('/')) out.add(rest);
			}
			return;
		}
		if (!v || typeof v !== 'object') return;
		if (seen.has(v as object)) return;
		seen.add(v as object);
		if (Array.isArray(v)) {
			for (const x of v) walk(x);
			return;
		}
		for (const k of Object.keys(v as Record<string, unknown>)) {
			walk((v as Record<string, unknown>)[k]);
		}
	};
	walk(value);
	return out;
};

/**
 * Deep-clone `value` and replace every recognized media URL string with
 * `${mediaPrefix}/<filename>`. Returns the cloned tree; the input is left
 * untouched. Cycle-safe (cycles are flattened to a fresh object — payloads
 * passed through `devalue` won't have cycles, but defensive).
 */
export const rewriteMediaUrls = <T>(value: T, uploadsBase: string, mediaPrefix: string): T => {
	const seen = new WeakMap<object, unknown>();
	const prefix = `${uploadsBase}/`;
	const normalizedMediaPrefix = mediaPrefix.replace(/\/$/, '');
	const walk = (v: unknown): unknown => {
		if (typeof v === 'string') {
			const m = RELATIVE_UPLOADS_RE.exec(v);
			if (m) return `${normalizedMediaPrefix}/${m[1]}`;
			if (v.startsWith(prefix)) {
				const rest = v.slice(prefix.length).split(/[?#]/)[0];
				if (rest && !rest.includes('/')) return `${normalizedMediaPrefix}/${rest}`;
			}
			return v;
		}
		if (!v || typeof v !== 'object') return v;
		const cached = seen.get(v as object);
		if (cached !== undefined) return cached;
		if (Array.isArray(v)) {
			const arr: unknown[] = [];
			seen.set(v as object, arr);
			for (const x of v) arr.push(walk(x));
			return arr;
		}
		const obj: Record<string, unknown> = {};
		seen.set(v as object, obj);
		for (const k of Object.keys(v as Record<string, unknown>)) {
			obj[k] = walk((v as Record<string, unknown>)[k]);
		}
		return obj;
	};
	return walk(value) as T;
};

const fileExists = (p: string): boolean => {
	try {
		fs.accessSync(p, fs.constants.F_OK);
		return true;
	} catch {
		return false;
	}
};

const CONCURRENCY = 8;

export type DownloadResult = {
	written: number;
	skipped: number;
	failed: Array<{ filename: string; reason: string }>;
};

/**
 * Download every filename in `filenames` from `${uploadsBase}/<filename>` into
 * `destDir`. Files already on disk are skipped (no etag check — backend
 * filenames are unique slugs, content is stable per name). Failures are
 * logged and collected, never thrown — one missing image shouldn't break the
 * build.
 */
export const downloadMedia = async (
	filenames: Iterable<string>,
	uploadsBase: string,
	destDir: string
): Promise<DownloadResult> => {
	const list = [...new Set(filenames)];
	const result: DownloadResult = { written: 0, skipped: 0, failed: [] };
	if (list.length === 0) return result;

	fs.mkdirSync(destDir, { recursive: true });

	let cursor = 0;
	const workers: Promise<void>[] = [];
	const next = async (): Promise<void> => {
		while (cursor < list.length) {
			const filename = list[cursor++];
			const target = path.join(destDir, filename);
			if (fileExists(target)) {
				result.skipped++;
				continue;
			}
			try {
				const res = await fetch(`${uploadsBase}/${filename}`);
				if (!res.ok) {
					result.failed.push({ filename, reason: `HTTP ${res.status}` });
					continue;
				}
				const buf = Buffer.from(await res.arrayBuffer());
				fs.writeFileSync(target, buf);
				result.written++;
			} catch (e) {
				result.failed.push({
					filename,
					reason: e instanceof Error ? e.message : String(e)
				});
			}
		}
	};
	for (let i = 0; i < Math.min(CONCURRENCY, list.length); i++) workers.push(next());
	await Promise.all(workers);
	return result;
};
