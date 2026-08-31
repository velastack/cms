<script lang="ts">
	import { page } from '$app/state';
	import type { ReleaseItem } from '../cms/cms-store.svelte.js';
	import type { CmsPayload } from '../cms/scope.js';
	import { diffPaths, type Tree } from '../cms/path.js';
	import { resolveRouteOnlyParams, resolveRouteUrl } from './resolve-route.js';
	import { Badge, type BadgeVariant } from './ui/badge/index.js';
	import { Button } from './ui/button/index.js';
	import * as Dialog from './ui/dialog/index.js';
	import { Input } from './ui/input/index.js';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		items: ReleaseItem[];
		publishing: boolean;
		error: string | null;
		user: { name: string };
		endpoint: string;
		onConfirm: (name: string | undefined) => void;
	};
	let { open, onOpenChange, items, publishing, error, user, endpoint, onConfirm }: Props = $props();

	const defaultLocale = $derived((page.data.cms as CmsPayload | undefined)?.locales?.[0] ?? '');

	/**
	 * Identity key shared across locales — `(kind, routeId, params)`. Two
	 * items with the same key are "the same page" edited in different locales
	 * and render as one row with both locales tagged. Treats `page` and
	 * `page-delete` as one identity so the row classifier can decide if the
	 * net effect is delete vs edit.
	 */
	const groupKey = (item: ReleaseItem): string => {
		if (item.kind === 'layout') return `layout|${item.routeId}`;
		if (item.kind === 'site') return 'site';
		const sortedKeys = Object.keys(item.params).sort();
		const qp = sortedKeys.map((k) => `${k}=${item.params[k]}`).join('&');
		return `page|${item.routeId}|${qp}`;
	};

	type Group = {
		key: string;
		items: ReleaseItem[];
		locales: string[];
		/** Earliest-added item — used for the URL label and primary classification. */
		primary: ReleaseItem;
		/** Latest `addedAt` across all locales — drives the "X minutes ago" suffix. */
		latestAddedAt: string;
	};

	const groups = $derived.by<Group[]>(() => {
		const map = new Map<string, Group>();
		for (const item of items) {
			const key = groupKey(item);
			const existing = map.get(key);
			const itemLocale = item.kind === 'site' ? '' : item.locale;
			if (existing) {
				existing.items.push(item);
				if (itemLocale && !existing.locales.includes(itemLocale)) existing.locales.push(itemLocale);
				if (item.addedAt < existing.primary.addedAt) existing.primary = item;
				if (item.addedAt > existing.latestAddedAt) existing.latestAddedAt = item.addedAt;
			} else {
				map.set(key, {
					key,
					items: [item],
					locales: itemLocale ? [itemLocale] : [],
					primary: item,
					latestAddedAt: item.addedAt
				});
			}
		}
		// Sort locales: default first, then alphabetical.
		for (const g of map.values()) {
			g.locales.sort((a, b) => {
				if (a === defaultLocale) return -1;
				if (b === defaultLocale) return 1;
				return a < b ? -1 : a > b ? 1 : 0;
			});
		}
		return [...map.values()];
	});

	let releaseName = $state('');
	/** Identity keys (locale-stripped) of pages that have NO published entry
	 *  in *any* locale yet — used to classify a row as "new" rather than "edited". */
	let draftPageKeys = $state<Set<string>>(new Set());

	const initials = $derived(
		user.name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('')
	);

	// Fetch the page map once on open so we can distinguish "new page" items
	// (page kind, no published entry yet) from "edited" or "SEO-only" items.
	// Across locales: a page with a published entry in ANY locale is "edited"
	// in every locale (the storage already exists; we're adding a translation),
	// not "new". So we union draft-status across locales here.
	$effect(() => {
		if (!open) return;
		void (async () => {
			try {
				const res = await fetch(`${endpoint}/pages`, { credentials: 'include' });
				if (!res.ok) return;
				const data = (await res.json()) as {
					routes: Array<{
						routeId: string;
						entries: Array<{ params: Record<string, string>; isDraft: boolean }>;
					}>;
				};
				const sortedParamsKey = (params: Record<string, string>): string => {
					const ks = Object.keys(params).sort();
					return ks.map((k) => `${k}=${params[k]}`).join('&');
				};
				const set = new Set<string>();
				for (const r of data.routes) {
					for (const e of r.entries) {
						if (e.isDraft) set.add(`page|${r.routeId}|${sortedParamsKey(e.params)}`);
					}
				}
				draftPageKeys = set;
			} catch {
				/* leave empty — items default to "edited" classification */
			}
		})();
	});

	type ChangeType = 'edited' | 'new' | 'delete' | 'gone' | 'redirect' | 'seo';

	const META_PREFIX = 'metadata.';

	/** All edited leaf paths in the item's tree. */
	const editedPaths = (tree: Tree): string[] => diffPaths(undefined, tree);

	/** Leaf paths under the `metadata.*` branch, surfaced without the prefix. */
	const metadataPaths = (tree: Tree): string[] =>
		editedPaths(tree)
			.filter((p) => p.startsWith(META_PREFIX))
			.map((p) => p.slice(META_PREFIX.length));

	/** Leaf paths NOT under the `metadata.*` branch. */
	const nonMetadataPaths = (tree: Tree): string[] =>
		editedPaths(tree).filter((p) => !p.startsWith(META_PREFIX));

	/** Classify a group: page-delete > new > seo > edited, evaluated across
	 *  all locales in the group. If any locale stages a delete, the row is a
	 *  delete. If ANY locale has only `metadata.*` edits and none have body
	 *  edits, it's "SEO". */
	const changeTypeOfGroup = (group: Group): ChangeType => {
		// page-delete in any locale wins; the publish summary should reflect
		// that the row's net effect is removal. Outcome priority: redirect > gone > delete.
		const deletes = group.items.filter((i) => i.kind === 'page-delete');
		if (deletes.length > 0) {
			if (deletes.some((d) => d.kind === 'page-delete' && d.outcome?.kind === 'redirect'))
				return 'redirect';
			if (deletes.some((d) => d.kind === 'page-delete' && d.outcome?.kind === 'gone'))
				return 'gone';
			return 'delete';
		}
		if (group.primary.kind === 'site') return 'edited';
		if (group.primary.kind === 'layout') return 'edited';
		if (draftPageKeys.has(group.key)) return 'new';
		const anyNonMeta = group.items.some(
			(i) => i.kind === 'page' && nonMetadataPaths(i.tree).length > 0
		);
		const anyMeta = group.items.some((i) => i.kind === 'page' && metadataPaths(i.tree).length > 0);
		if (!anyNonMeta && anyMeta) return 'seo';
		return 'edited';
	};

	const labelFor = (item: ReleaseItem): string => {
		if (item.kind === 'site') return 'Site settings';
		if (item.kind === 'layout') return resolveRouteOnlyParams(item.routeId);
		try {
			return resolveRouteUrl(item.routeId, item.params);
		} catch {
			return resolveRouteOnlyParams(item.routeId);
		}
	};

	const summarizeNames = (names: string[], verb: string): string => {
		if (names.length === 0) return verb;
		if (names.length === 1) return `${verb} ${names[0]}`;
		return `${verb} ${names[0]} +${names.length - 1} more`;
	};

	const unionPaths = (group: Group, filter: (paths: string[]) => string[]): string[] => {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const i of group.items) {
			if (i.kind === 'page-delete') continue;
			for (const p of filter(editedPaths(i.tree))) {
				if (seen.has(p)) continue;
				seen.add(p);
				out.push(p);
			}
		}
		return out;
	};

	const metaTextForGroup = (group: Group): string => {
		const deletes = group.items.filter((i) => i.kind === 'page-delete');
		if (deletes.length > 0) {
			// Delete description follows the same outcome priority as classification.
			const redirect = deletes.find(
				(d) => d.kind === 'page-delete' && d.outcome?.kind === 'redirect'
			);
			if (redirect && redirect.kind === 'page-delete' && redirect.outcome?.kind === 'redirect')
				return `Redirects to ${redirect.outcome.to}`;
			if (deletes.some((d) => d.kind === 'page-delete' && d.outcome?.kind === 'gone'))
				return 'Marked permanently gone';
			return 'Marked for deletion';
		}
		if (group.primary.kind === 'site' || group.primary.kind === 'layout') {
			return summarizeNames(
				unionPaths(group, (p) => p),
				'Edited'
			);
		}
		if (changeTypeOfGroup(group) === 'new') return 'Created';
		const non = unionPaths(group, (paths) => paths.filter((p) => !p.startsWith(META_PREFIX)));
		if (non.length > 0) return summarizeNames(non, 'Edited');
		const meta = unionPaths(group, (paths) =>
			paths.filter((p) => p.startsWith(META_PREFIX)).map((p) => p.slice(META_PREFIX.length))
		);
		return summarizeNames(meta, 'Updated');
	};

	const formatRelative = (iso: string): string => {
		const t = new Date(iso).getTime();
		if (Number.isNaN(t)) return '';
		const now = Date.now();
		const seconds = Math.max(0, Math.floor((now - t) / 1000));
		if (seconds < 45) return 'just now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return minutes <= 1 ? '1 minute ago' : `${minutes} minutes ago`;
		const d = new Date(t);
		const today = new Date(now);
		const sameDay =
			d.getFullYear() === today.getFullYear() &&
			d.getMonth() === today.getMonth() &&
			d.getDate() === today.getDate();
		if (sameDay) {
			const h = d.getHours();
			if (h < 12) return 'this morning';
			if (h < 17) return 'this afternoon';
			return 'this evening';
		}
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		const isYesterday =
			d.getFullYear() === yesterday.getFullYear() &&
			d.getMonth() === yesterday.getMonth() &&
			d.getDate() === yesterday.getDate();
		if (isYesterday) return 'yesterday';
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	};

	/** Submit-disabled gate: nothing to publish when there are no items at all.
	 *  (Group count is fine here too — no items → no groups.) */
	const total = $derived(items.length);

	const submit = () => {
		if (publishing || total === 0) return;
		const trimmed = releaseName.trim();
		onConfirm(trimmed === '' ? undefined : trimmed);
	};

	const badgeVariantOf = (t: ChangeType): BadgeVariant => {
		if (t === 'edited') return 'warn';
		if (t === 'new') return 'success';
		if (t === 'delete' || t === 'gone') return 'destructive';
		if (t === 'redirect') return 'edit';
		return 'edit';
	};
	const badgeLabel = (t: ChangeType): string => (t === 'seo' ? 'SEO' : t);
</script>

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		// Block close while publishing — `Cancel` and overlay click route through here.
		if (!next && publishing) return;
		onOpenChange(next);
	}}
>
	<Dialog.Content showCloseButton={false} class="vela:max-w-[30rem] vela:p-0">
		<form
			class="vela:flex vela:flex-col vela:gap-0"
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<Dialog.Header class="vela:gap-1 vela:px-6 vela:pt-5 vela:pb-4">
				<Dialog.Title>Review &amp; publish</Dialog.Title>
				<Dialog.Description>All changes will go live together.</Dialog.Description>
			</Dialog.Header>

			<ul
				class="vela:list-none vela:m-0 vela:px-6 vela:pb-4 vela:flex vela:flex-col vela:gap-3 vela:overflow-y-auto vela:max-h-[40vh]"
			>
				{#each groups as group (group.key)}
					{@const t = changeTypeOfGroup(group)}
					{@const showLocaleTags =
						group.locales.length > 1 ||
						(group.locales.length === 1 && group.locales[0] !== defaultLocale)}
					<li class="vela:flex vela:items-start vela:gap-3">
						<span class="vela:flex vela:flex-col vela:min-w-0 vela:flex-1">
							<span class="vela:flex vela:items-center vela:gap-1.5 vela:min-w-0">
								<span class="vela:font-mono vela:text-[14px] vela:text-bar-text vela:truncate">
									{labelFor(group.primary)}
								</span>
								{#if showLocaleTags}
									{#each group.locales as locale (locale)}
										<Badge variant="default" size="sm" class="vela:shrink-0 vela:font-mono">
											{locale}
										</Badge>
									{/each}
								{/if}
							</span>
							<span class="vela:mt-0.5 vela:text-[12px] vela:text-bar-text-secondary vela:truncate">
								{metaTextForGroup(group)} · {formatRelative(group.latestAddedAt)}
							</span>
						</span>
						<Badge variant={badgeVariantOf(t)} class="vela:shrink-0 vela:mt-0.5">
							{badgeLabel(t)}
						</Badge>
					</li>
				{/each}
			</ul>

			<div
				class="vela:px-6 vela:pt-4 vela:pb-3 vela:flex vela:flex-col vela:gap-1.5
					vela:border-t vela:border-[var(--cms-bar-divider)]"
			>
				<div class="vela:flex vela:items-baseline vela:justify-between">
					<label for="vela-release-name" class="vela:text-[13px] vela:text-bar-text">
						Release name <span class="vela:text-bar-text-tertiary">(optional)</span>
					</label>
					<span class="vela:text-[12px] vela:text-bar-text-tertiary"
						>Helps you find it in History</span
					>
				</div>
				<Input
					id="vela-release-name"
					placeholder="Spring relaunch"
					bind:value={releaseName}
					disabled={publishing}
					class="vela:bg-[var(--cms-bar-bg-hover)]"
				/>
			</div>

			{#if error}
				<p
					role="alert"
					class="vela:mx-6 vela:mb-2 vela:px-3 vela:py-2 vela:rounded-md
						vela:bg-[var(--cms-status-error-bg)] vela:text-[var(--cms-status-error-text)] vela:text-[12px]"
				>
					{error}
				</p>
			{/if}

			<Dialog.Footer>
				<span class="vela:text-[12px] vela:text-bar-text-secondary">
					Publishing as <span class="vela:font-medium vela:text-bar-text">{initials}</span>
				</span>
				<div class="vela:flex vela:items-center vela:gap-2">
					<Button variant="ghost" onclick={() => onOpenChange(false)} disabled={publishing}>
						Cancel
					</Button>
					<Button type="submit" disabled={publishing || total === 0}>
						{#if publishing}
							Publishing…
						{:else}
							Publish {total}
							{total === 1 ? 'change' : 'changes'}
						{/if}
					</Button>
				</div>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
