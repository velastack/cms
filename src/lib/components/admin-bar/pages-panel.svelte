<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { cmsStore } from '../cms/cms-store.svelte.js';
	import type { CmsNewPageConfig } from './new-page-config.js';
	import { resolveRouteOnlyParams, resolveRouteUrl } from './resolve-route.js';

	type PageEntry = {
		params: Record<string, string>;
		isDraft: boolean;
		isDeletePending: boolean;
	};

	type PageRoute = {
		routeId: string;
		ownedParams: string[];
		entries: PageEntry[];
	};

	type Props = {
		endpoint: string;
		newPages: CmsNewPageConfig[];
		onClose: () => void;
		onChanged: () => Promise<void> | void;
		onRequestNew: (config: CmsNewPageConfig) => void;
	};
	let { endpoint, newPages, onClose, onChanged, onRequestNew }: Props = $props();

	let routes = $state<PageRoute[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let mutating = $state<string | null>(null);

	const creatableByRouteId = $derived(new Map(newPages.map((c) => [c.routeId, c] as const)));

	const rowKey = (routeId: string, params: Record<string, string>): string =>
		`${routeId}?${JSON.stringify(params)}`;

	// True when the row's (routeId, params) matches the page the user is
	// currently viewing. Mutating that page (delete or undo) skips the
	// post-mutation SSR refresh — invalidating would re-render with the
	// preview overlay and 404 on a staged delete, which is jarring. The admin
	// bar state still updates via `cmsStore.fetchOpenRelease`; the user sees
	// fresh data when they navigate away.
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
			const res = await fetch(`${endpoint}/pages`);
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

	const onNavigate = async (routeId: string, params: Record<string, string>) => {
		const url = new URL(resolveRouteUrl(routeId, params), page.url.origin);
		const key = cmsStore.openRelease?.preview_key;
		if (key) url.searchParams.set('preview', key);
		onClose();
		await goto(url, { keepFocus: true, noScroll: true });
	};

	const onDelete = async (routeId: string, params: Record<string, string>, isDraft: boolean) => {
		const url = resolveRouteUrl(routeId, params);
		const message = isDraft
			? `Discard draft page ${url}?`
			: `Stage delete for ${url}? It will be removed when you publish.`;
		if (!confirm(message)) return;
		const key = rowKey(routeId, params);
		const onCurrent = isCurrentPage(routeId, params);
		mutating = key;
		try {
			const res = await fetch(`${endpoint}/pages`, {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ routeId, params })
			});
			if (!res.ok) {
				error = 'Could not delete page.';
				return;
			}
			await cmsStore.fetchOpenRelease(endpoint);
			await fetchList();
			if (!onCurrent) await onChanged();
		} finally {
			mutating = null;
		}
	};

	const onUndoDelete = async (routeId: string, params: Record<string, string>) => {
		const key = rowKey(routeId, params);
		const onCurrent = isCurrentPage(routeId, params);
		mutating = key;
		try {
			const res = await fetch(`${endpoint}/release/items`, {
				method: 'DELETE',
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

<div class="cms-panel" role="dialog" aria-label="Pages">
	<header class="cms-panel__header">
		<h2>Pages</h2>
		<button type="button" class="cms-panel__close" aria-label="Close" onclick={onClose}>×</button>
	</header>

	{#if loading && routes.length === 0}
		<p class="cms-panel__empty">Loading…</p>
	{:else if error}
		<p class="cms-panel__empty">{error}</p>
	{:else if routes.length === 0}
		<p class="cms-panel__empty">No CMS pages.</p>
	{:else}
		<ul class="cms-panel__groups">
			{#each routes as route (route.routeId)}
				{@const creator = creatableByRouteId.get(route.routeId)}
				<li class="cms-panel__group">
					{#if creator}
						<div class="cms-panel__group-header">
							<div class="cms-panel__group-title">
								<span class="cms-panel__group-routeid">{resolveRouteOnlyParams(route.routeId)}</span
								>
								<span class="cms-panel__group-count">
									({route.entries.length}
									{route.entries.length === 1 ? 'page' : 'pages'})
								</span>
							</div>
							<button
								type="button"
								class="cms-panel__group-new"
								onclick={() => onRequestNew(creator)}
							>
								+ New
							</button>
						</div>
					{/if}

					{#if route.entries.length > 0}
						<ul class="cms-panel__items">
							{#each route.entries as entry (rowKey(route.routeId, entry.params))}
								{@const url = resolveRouteUrl(route.routeId, entry.params)}
								{@const key = rowKey(route.routeId, entry.params)}
								<li class="cms-panel__item">
									<button
										type="button"
										class="cms-panel__row-link"
										onclick={() => onNavigate(route.routeId, entry.params)}
									>
										<span class="cms-panel__item-label">{url}</span>
										{#if entry.isDraft}
											<span class="cms-panel__tag cms-panel__tag--draft">draft</span>
										{:else if entry.isDeletePending}
											<span class="cms-panel__tag cms-panel__tag--delete">delete pending</span>
										{/if}
									</button>
									{#if creator}
										{#if entry.isDeletePending}
											<button
												type="button"
												class="cms-panel__discard"
												disabled={mutating === key}
												onclick={() => onUndoDelete(route.routeId, entry.params)}
											>
												{mutating === key ? '…' : 'Undo'}
											</button>
										{:else}
											<button
												type="button"
												class="cms-panel__discard"
												disabled={mutating === key}
												onclick={() => onDelete(route.routeId, entry.params, entry.isDraft)}
											>
												{mutating === key ? '…' : 'Delete'}
											</button>
										{/if}
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.cms-panel {
		position: fixed;
		top: 4rem;
		left: 50%;
		transform: translateX(-50%);
		width: min(100%, 36rem);
		padding: 1rem;
		border-radius: 0.75rem;
		background: rgba(20, 20, 20, 0.94);
		color: #fafafa;
		backdrop-filter: blur(8px);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
		z-index: 9998;
		font-family:
			ui-sans-serif,
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			sans-serif;
		font-size: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-height: calc(100vh - 6rem);
	}
	.cms-panel__header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.cms-panel__header h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}
	.cms-panel__close {
		width: 1.75rem;
		height: 1.75rem;
		border: 0;
		border-radius: 9999px;
		background: rgba(255, 255, 255, 0.06);
		color: inherit;
		cursor: pointer;
		font-size: 1.1rem;
		line-height: 1;
	}
	.cms-panel__close:hover {
		background: rgba(255, 255, 255, 0.14);
	}
	.cms-panel__empty {
		margin: 0;
		opacity: 0.7;
	}
	.cms-panel__groups {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		overflow-y: auto;
	}
	.cms-panel__group {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.cms-panel__group-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding-bottom: 0.25rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	.cms-panel__group-title {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		min-width: 0;
		flex: 1;
	}
	.cms-panel__group-routeid {
		font-family: ui-monospace, monospace;
		font-size: 0.78rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cms-panel__group-count {
		font-size: 0.7rem;
		opacity: 0.6;
	}
	.cms-panel__group-new {
		flex-shrink: 0;
		padding: 0.2rem 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 9999px;
		background: rgba(255, 255, 255, 0.06);
		color: inherit;
		cursor: pointer;
		font: inherit;
		font-size: 0.72rem;
	}
	.cms-panel__group-new:hover {
		background: rgba(255, 255, 255, 0.14);
	}
	.cms-panel__items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.cms-panel__item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.625rem;
		border-radius: 0.375rem;
		background: rgba(255, 255, 255, 0.04);
	}
	.cms-panel__row-link {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
		font: inherit;
		text-align: left;
	}
	.cms-panel__row-link:hover .cms-panel__item-label {
		text-decoration: underline;
	}
	.cms-panel__item-label {
		font-family: ui-monospace, monospace;
		font-size: 0.78rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}
	.cms-panel__tag {
		flex-shrink: 0;
		padding: 0.05rem 0.45rem;
		border-radius: 9999px;
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.cms-panel__tag--draft {
		background: rgba(120, 180, 255, 0.18);
		color: #a8c8ff;
	}
	.cms-panel__tag--delete {
		background: rgba(220, 60, 60, 0.18);
		color: #ffb3b3;
	}
	.cms-panel__discard {
		flex-shrink: 0;
		padding: 0.2rem 0.55rem;
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 9999px;
		background: transparent;
		color: inherit;
		cursor: pointer;
		font: inherit;
		font-size: 0.72rem;
	}
	.cms-panel__discard:hover {
		background: rgba(255, 255, 255, 0.12);
	}
	.cms-panel__discard:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
