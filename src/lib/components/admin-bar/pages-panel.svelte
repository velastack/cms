<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { cmsStore } from '../cms/cms-store.svelte.js';
	import type { CmsCreatablePageConfigWithRouteId } from './page-config.js';
	import NewPageDialog from './new-page-dialog.svelte';
	import PanelHeader from './panel-header.svelte';
	import Panel from './panel.svelte';
	import { resolveRouteOnlyParams, resolveRouteUrl } from './resolve-route.js';
	import { Badge } from './ui/badge/index.js';
	import { Button } from './ui/button/index.js';
	import { Input } from './ui/input/index.js';

	type PageEntry = {
		params: Record<string, string>;
		isDraft: boolean;
		isDeletePending: boolean;
		redirectTo?: string;
		gone?: boolean;
	};

	type PageRoute = {
		routeId: string;
		ownedParams: string[];
		entries: PageEntry[];
	};

	type Props = {
		endpoint: string;
		creatablePages: CmsCreatablePageConfigWithRouteId[];
		onClose: () => void;
		onChanged: () => Promise<void> | void;
		onRequestNew: (config: CmsCreatablePageConfigWithRouteId) => void;
		onRequestDuplicate: (
			config: CmsCreatablePageConfigWithRouteId,
			sourceParams: Record<string, string>
		) => void;
		onRequestDelete: (
			routeId: string,
			params: Record<string, string>,
			isDraft: boolean
		) => void;
	};
	let {
		endpoint,
		creatablePages,
		onClose,
		onChanged,
		onRequestNew,
		onRequestDuplicate,
		onRequestDelete
	}: Props = $props();

	let routes = $state<PageRoute[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let mutating = $state<string | null>(null);
	let query = $state('');
	let searchEl = $state<HTMLInputElement | null>(null);
	let scrollContainerEl = $state<HTMLElement | null>(null);
	let highlightedIndex = $state(-1);

	let renameConfig = $state<CmsCreatablePageConfigWithRouteId | null>(null);
	let renameFromParams = $state<Record<string, string> | null>(null);
	let renameRunning = $state(false);
	let renameError = $state<string | null>(null);

	const creatableByRouteId = $derived(new Map(creatablePages.map((c) => [c.routeId, c] as const)));

	const rowKey = (routeId: string, params: Record<string, string>): string =>
		`${routeId}?${JSON.stringify(params)}`;

	const isCurrentPage = (routeId: string, params: Record<string, string>): boolean => {
		const current = page.data.cms?.page;
		if (!current || current.routeId !== routeId) return false;
		const ck = Object.keys(current.params);
		if (ck.length !== Object.keys(params).length) return false;
		for (const k of ck) if (current.params[k] !== params[k]) return false;
		return true;
	};

	const fetchList = async (): Promise<void> => {
		loading = true;
		try {
			const res = await fetch(`${endpoint}/pages`, { credentials: 'include' });
			if (!res.ok) {
				error = 'Could not load pages.';
				return;
			}
			const data = (await res.json()) as { routes: PageRoute[] };
			routes = data.routes;
			error = null;
		} catch {
			error = 'Could not load pages.';
		} finally {
			loading = false;
		}
	};

	$effect(() => {
		void fetchList();
	});

	$effect(() => {
		searchEl?.focus();
	});

	const editedKeys = $derived.by(() => {
		const set = new Set<string>();
		for (const item of cmsStore.openRelease?.items ?? []) {
			if (item.kind === 'layout') continue;
			set.add(rowKey(item.routeId, item.params));
		}
		return set;
	});
	const hasDraft = (routeId: string, entry: PageEntry): boolean =>
		entry.isDraft || entry.isDeletePending || editedKeys.has(rowKey(routeId, entry.params));

	const totalPages = $derived(routes.reduce((n, r) => n + r.entries.length, 0));
	const draftPages = $derived(
		routes.reduce((n, r) => n + r.entries.filter((e) => hasDraft(r.routeId, e)).length, 0)
	);

	const matchesQuery = (routeId: string, params: Record<string, string>): boolean => {
		const q = query.trim().toLowerCase();
		if (!q) return true;
		const url = resolveRouteUrl(routeId, params).toLowerCase();
		const stripped = resolveRouteOnlyParams(routeId).toLowerCase();
		return url.includes(q) || stripped.includes(q);
	};

	type StaticRow = { routeId: string; entry: PageEntry; url: string };
	const staticRows = $derived.by<StaticRow[]>(() => {
		const out: StaticRow[] = [];
		for (const r of routes) {
			if (creatableByRouteId.has(r.routeId)) continue;
			for (const e of r.entries) {
				if (!matchesQuery(r.routeId, e.params)) continue;
				out.push({ routeId: r.routeId, entry: e, url: resolveRouteUrl(r.routeId, e.params) });
			}
		}
		return out.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
	});

	type TemplateGroup = {
		routeId: string;
		creator: CmsCreatablePageConfigWithRouteId;
		entries: Array<{ entry: PageEntry; url: string }>;
	};
	const templateGroups = $derived.by<TemplateGroup[]>(() => {
		const isFiltering = query.trim() !== '';
		const out: TemplateGroup[] = [];
		for (const r of routes) {
			const creator = creatableByRouteId.get(r.routeId);
			if (!creator) continue;
			const entries = r.entries
				.filter((e) => matchesQuery(r.routeId, e.params))
				.map((entry) => ({ entry, url: resolveRouteUrl(r.routeId, entry.params) }));
			// While filtering, hide template cards whose entries all got filtered
			// out — keeps the search results focused. With no filter, empty cards
			// stay so the user can still hit "+ New".
			if (isFiltering && entries.length === 0) continue;
			out.push({ routeId: r.routeId, creator, entries });
		}
		return out;
	});

	type FlatRow = { routeId: string; entry: PageEntry; key: string };
	const flatRows = $derived.by<FlatRow[]>(() => {
		const out: FlatRow[] = [];
		for (const r of staticRows) {
			out.push({ routeId: r.routeId, entry: r.entry, key: rowKey(r.routeId, r.entry.params) });
		}
		for (const g of templateGroups) {
			for (const e of g.entries) {
				out.push({
					routeId: g.routeId,
					entry: e.entry,
					key: rowKey(g.routeId, e.entry.params)
				});
			}
		}
		return out;
	});

	const highlightedKey = $derived(
		highlightedIndex >= 0 && highlightedIndex < flatRows.length
			? flatRows[highlightedIndex].key
			: null
	);

	// Reset highlight when the filter changes — indices are no longer meaningful.
	$effect(() => {
		query;
		highlightedIndex = -1;
	});

	$effect(() => {
		if (highlightedIndex >= flatRows.length) highlightedIndex = flatRows.length - 1;
	});

	$effect(() => {
		if (highlightedKey === null || !scrollContainerEl) return;
		const el = scrollContainerEl.querySelector(
			`[data-row-key="${CSS.escape(highlightedKey)}"]`
		) as HTMLElement | null;
		el?.scrollIntoView({ block: 'nearest' });
	});

	const navigateTo = async (routeId: string, params: Record<string, string>) => {
		const url = new URL(resolveRouteUrl(routeId, params), page.url.origin);
		const key = cmsStore.openRelease?.preview_key;
		if (key) url.searchParams.set('preview', key);
		// onClose();
		await goto(url, { keepFocus: true, noScroll: true });
	};

	const onView = async (routeId: string, params: Record<string, string>) => {
		await navigateTo(routeId, params);
	};

	const onEdit = async (routeId: string, params: Record<string, string>) => {
		await navigateTo(routeId, params);
		cmsStore.isEditing = true;
	};

	const onDiscard = async (routeId: string, params: Record<string, string>) => {
		const url = resolveRouteUrl(routeId, params);
		if (!confirm(`Discard pending edits on ${url}?`)) return;
		const key = rowKey(routeId, params);
		mutating = key;
		try {
			const res = await fetch(`${endpoint}/release/items`, {
				method: 'DELETE',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ kind: 'page', routeId, params })
			});
			if (!res.ok) {
				error = 'Could not discard.';
				return;
			}
			await cmsStore.fetchOpenRelease(endpoint);
			await fetchList();
			await onChanged();
		} finally {
			mutating = null;
		}
	};

	const setHighlightByKey = (k: string) => {
		const i = flatRows.findIndex((r) => r.key === k);
		if (i >= 0) highlightedIndex = i;
	};

	const onSearchKeydown = (e: KeyboardEvent) => {
		if (e.key === 'ArrowDown') {
			if (flatRows.length === 0) return;
			e.preventDefault();
			highlightedIndex =
				highlightedIndex < 0 ? 0 : Math.min(highlightedIndex + 1, flatRows.length - 1);
		} else if (e.key === 'ArrowUp') {
			if (highlightedIndex < 0) return;
			e.preventDefault();
			highlightedIndex = highlightedIndex === 0 ? -1 : highlightedIndex - 1;
		} else if (e.key === 'Enter') {
			if (highlightedIndex < 0 || highlightedIndex >= flatRows.length) return;
			e.preventDefault();
			const r = flatRows[highlightedIndex];
			void onView(r.routeId, r.entry.params);
		}
	};

	const openRenameDialog = (
		config: CmsCreatablePageConfigWithRouteId,
		fromParams: Record<string, string>
	) => {
		renameConfig = config;
		renameFromParams = fromParams;
		renameError = null;
	};

	const closeRenameDialog = () => {
		if (renameRunning) return;
		renameConfig = null;
		renameFromParams = null;
		renameError = null;
	};

	const onRenameSubmit = async (rawValues: Record<string, string>) => {
		const config = renameConfig;
		const fromParams = renameFromParams;
		if (!config || !fromParams) return;
		renameRunning = true;
		renameError = null;
		try {
			let toParams: Record<string, string>;
			try {
				toParams = config.transform(rawValues).params;
			} catch {
				renameError = 'Could not derive params from input.';
				return;
			}
			const samePage = Object.keys(toParams).every((k) => toParams[k] === fromParams[k]);
			if (samePage) {
				renameError = 'New slug matches the existing one.';
				return;
			}
			const locale = page.data.cms?.locale ?? '';
			let toUrl: string;
			try {
				toUrl = resolveRouteUrl(config.routeId, toParams);
			} catch {
				renameError = 'Could not derive a target URL.';
				return;
			}
			const onCurrent = isCurrentPage(config.routeId, fromParams);
			const result = await cmsStore.renameSlug(endpoint, {
				routeId: config.routeId,
				fromParams,
				toParams,
				locale,
				toUrl
			});
			if (!result.ok) {
				renameError = 'Could not rename page.';
				return;
			}
			renameConfig = null;
			renameFromParams = null;
			await fetchList();
			if (!onCurrent) await onChanged();
		} finally {
			renameRunning = false;
		}
	};

	const onUndoDelete = async (routeId: string, params: Record<string, string>) => {
		const key = rowKey(routeId, params);
		const onCurrent = isCurrentPage(routeId, params);
		mutating = key;
		try {
			const res = await fetch(`${endpoint}/release/items`, {
				method: 'DELETE',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ kind: 'page-delete', routeId, params })
			});
			if (!res.ok) {
				error = 'Could not undo delete.';
				return;
			}
			await cmsStore.fetchOpenRelease(endpoint);
			await fetchList();
			if (!onCurrent) await onChanged();
		} finally {
			mutating = null;
		}
	};
</script>

<Panel ariaLabel="All pages" {onClose}>
	<PanelHeader title="All pages" {onClose} class="vela:pb-2">
		{#snippet subtitle()}
			<span class="vela:text-[12px] vela:text-bar-text-secondary vela:truncate">
				{totalPages}
				{totalPages === 1 ? 'page' : 'pages'}{draftPages > 0 ? ` · ${draftPages} with draft` : ''}
			</span>
		{/snippet}
	</PanelHeader>

	<div class="vela:px-4 vela:pb-3">
		<div class="vela:relative">
			<SearchIcon
				class="vela:absolute vela:left-2.5 vela:top-1/2 vela:-translate-y-1/2 vela:size-4 vela:text-bar-text-tertiary vela:pointer-events-none"
			/>
			<Input
				bind:ref={searchEl}
				bind:value={query}
				onkeydown={onSearchKeydown}
				placeholder="Filter pages…"
				aria-label="Filter pages"
				class="vela:pl-8 vela:pr-9"
			/>
			<kbd
				class="vela:absolute vela:right-2 vela:top-1/2 vela:-translate-y-1/2
					vela:inline-flex vela:items-center vela:justify-center vela:min-w-5 vela:h-5 vela:px-1
					vela:rounded vela:border vela:border-[var(--cms-bar-divider)]
					vela:text-[11px] vela:font-mono vela:text-bar-text-tertiary"
			>
				/
			</kbd>
		</div>
	</div>

	<div
		bind:this={scrollContainerEl}
		class="vela:overflow-y-auto vela:px-4 vela:pb-3 vela:flex vela:flex-col vela:gap-3"
	>
		{#if loading && routes.length === 0}
			<p class="vela:text-[13px] vela:text-bar-text-tertiary vela:py-2">Loading…</p>
		{:else if error}
			<p class="vela:text-[13px] vela:text-bar-text-tertiary vela:py-2">{error}</p>
		{:else if routes.length === 0}
			<p class="vela:text-[13px] vela:text-bar-text-tertiary vela:py-2">No CMS pages.</p>
		{:else}
			{#if staticRows.length > 0}
				<ul class="vela:list-none vela:pl-0 vela:m-0 vela:flex vela:flex-col">
					{#each staticRows as { routeId, entry, url } (rowKey(routeId, entry.params))}
						{@const k = rowKey(routeId, entry.params)}
						<li
							data-row-key={k}
							onmouseenter={() => setHighlightByKey(k)}
							class="vela:flex vela:items-center vela:gap-2 vela:min-h-9 vela:px-1.5 vela:py-1.5 vela:rounded-md {highlightedKey ===
							k
								? 'vela:bg-[var(--cms-bar-bg-hover)]'
								: ''}"
						>
							<span class="vela:flex vela:items-center vela:justify-center vela:w-3 vela:h-3">
								{#if hasDraft(routeId, entry)}
									<span
										class="vela:w-1.5 vela:h-1.5 vela:rounded-full vela:bg-[var(--cms-status-warn-dot)]"
									></span>
								{/if}
							</span>
							<span
								class="vela:font-mono vela:text-[12px] vela:text-bar-text vela:truncate vela:flex-1"
							>
								{url}
							</span>
							{#if entry.isDeletePending}
								<Badge variant="warn" size="sm">
									{entry.redirectTo
										? 'redirect pending'
										: entry.gone
											? 'gone pending'
											: 'delete pending'}
								</Badge>
								{#if highlightedKey === k}
									<Button
										variant="outline"
										size="xs"
										disabled={mutating === k}
										onclick={() => onUndoDelete(routeId, entry.params)}
									>
										{mutating === k ? '…' : 'Undo'}
									</Button>
								{/if}
							{:else if highlightedKey === k}
								{#if hasDraft(routeId, entry)}
									<Button
										variant="outline"
										size="xs"
										disabled={mutating === k}
										onclick={() => onDiscard(routeId, entry.params)}
									>
										{mutating === k ? '…' : 'Discard'}
									</Button>
								{/if}
								<Button variant="outline" size="xs" onclick={() => onView(routeId, entry.params)}>
									View
								</Button>
								<Button variant="outline" size="xs" onclick={() => onEdit(routeId, entry.params)}>
									Edit
								</Button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#each templateGroups as group (group.routeId)}
				<section
					class="vela:rounded-lg vela:bg-[var(--cms-template-bg)] vela:border vela:border-[var(--cms-bar-divider)] vela:overflow-hidden"
				>
					<div
						class="vela:flex vela:items-center vela:justify-between vela:gap-2 vela:px-3 vela:py-2"
					>
						<div class="vela:flex vela:items-baseline vela:gap-2 vela:min-w-0">
							<span class="vela:text-[11px] vela:text-bar-text-tertiary">Template</span>
							<span
								class="vela:font-mono vela:text-[12px] vela:px-1.5 vela:py-0.5 vela:rounded
									vela:bg-[var(--cms-template-accent-bg)] vela:text-[var(--cms-template-accent-text)] vela:truncate"
							>
								{resolveRouteOnlyParams(group.routeId)}
							</span>
						</div>
						<Button
							variant="outline"
							size="pill"
							class="vela:shrink-0"
							onclick={() => onRequestNew(group.creator)}
						>
							+ New {group.creator.type}
						</Button>
					</div>
					{#if group.entries.length > 0}
						<ul
							class="vela:list-none vela:pl-0 vela:m-0 vela:flex vela:flex-col vela:px-1.5 vela:pb-1.5"
						>
							{#each group.entries as { entry, url } (rowKey(group.routeId, entry.params))}
								{@const k = rowKey(group.routeId, entry.params)}
								<li
									data-row-key={k}
									onmouseenter={() => setHighlightByKey(k)}
									class="vela:flex vela:items-center vela:gap-2 vela:min-h-9 vela:px-1.5 vela:py-1.5 vela:rounded-md {highlightedKey ===
									k
										? 'vela:bg-[var(--cms-bar-bg-hover)]'
										: ''}"
								>
									<span class="vela:flex vela:items-center vela:justify-center vela:w-3 vela:h-3">
										{#if hasDraft(group.routeId, entry)}
											<span
												class="vela:w-1.5 vela:h-1.5 vela:rounded-full vela:bg-[var(--cms-status-warn-dot)]"
											></span>
										{/if}
									</span>
									<span
										class="vela:font-mono vela:text-[12px] vela:text-bar-text vela:truncate vela:flex-1"
									>
										{url}
									</span>
									{#if entry.isDeletePending}
										<Badge variant="warn" size="sm">
											{entry.redirectTo
												? 'redirect pending'
												: entry.gone
													? 'gone pending'
													: 'delete pending'}
										</Badge>
										{#if highlightedKey === k}
											<Button
												variant="outline"
												size="xs"
												disabled={mutating === k}
												onclick={() => onUndoDelete(group.routeId, entry.params)}
											>
												{mutating === k ? '…' : 'Undo'}
											</Button>
										{/if}
									{:else if highlightedKey === k}
										{#if hasDraft(group.routeId, entry)}
											<Button
												variant="outline"
												size="xs"
												disabled={mutating === k}
												onclick={() => onDiscard(group.routeId, entry.params)}
											>
												{mutating === k ? '…' : 'Discard'}
											</Button>
										{/if}
										<Button
											variant="outline"
											size="xs"
											onclick={() => onView(group.routeId, entry.params)}
										>
											View
										</Button>
										<Button
											variant="outline"
											size="xs"
											onclick={() => onEdit(group.routeId, entry.params)}
										>
											Edit
										</Button>
										<Button
											variant="outline"
											size="xs"
											onclick={() => onRequestDuplicate(group.creator, entry.params)}
										>
											Duplicate
										</Button>
										{#if !entry.isDraft && !entry.isDeletePending}
											<Button
												variant="outline"
												size="xs"
												onclick={() => openRenameDialog(group.creator, entry.params)}
											>
												Rename
											</Button>
										{/if}
										<Button
											variant="outline-destructive"
											size="xs"
											disabled={mutating === k}
											onclick={() =>
												onRequestDelete(group.routeId, entry.params, entry.isDraft)}
										>
											{mutating === k ? '…' : 'Delete'}
										</Button>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/each}

			{#if query.trim() && staticRows.length === 0 && templateGroups.length === 0}
				<p class="vela:text-[13px] vela:text-bar-text-tertiary vela:py-2 vela:px-1.5">
					No pages match "{query}".
				</p>
			{/if}
		{/if}
	</div>
</Panel>

{#if renameConfig}
	<NewPageDialog
		open={true}
		onOpenChange={(next) => {
			if (!next) closeRenameDialog();
		}}
		config={renameConfig}
		creating={renameRunning}
		error={renameError}
		onCreate={onRenameSubmit}
		mode="rename"
	/>
{/if}
