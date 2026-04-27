<script lang="ts">
	import { goto, invalidateAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { cmsStore } from '../cms/cms-store.svelte.js';
	import './admin-bar.css';
	import HistoryPanel from './history-panel.svelte';
	import type { CmsNewPageConfig } from './new-page-config.js';
	import NewPageDialog from './new-page-dialog.svelte';
	import PagesPanel from './pages-panel.svelte';
	import PublishDialog from './publish-dialog.svelte';
	import { resolveRouteUrl } from './resolve-route.js';
	import { Button } from './ui/button/index.js';
	import WorkingCopyPanel from './working-copy-panel.svelte';

	type Props = {
		user: { id: string; name: string };
		endpoint: string;
		newPages: CmsNewPageConfig[];
		onClose: () => void;
	};
	let { user, endpoint, newPages, onClose }: Props = $props();

	const initials = $derived(
		user.name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('')
	);

	let seoOpen = $state(false);
	let workingCopyOpen = $state(false);
	let historyOpen = $state(false);
	let pagesOpen = $state(false);
	let publishOpen = $state(false);
	let publishing = $state(false);
	let publishError = $state<string | null>(null);

	let newDialog = $state<CmsNewPageConfig | null>(null);
	let newPageError = $state<string | null>(null);
	let newPageCreating = $state(false);

	const counts = $derived(cmsStore.workingCopyCounts);
	const previewKey = $derived(cmsStore.openRelease?.preview_key ?? null);

	const previewUrl = $derived.by(() => {
		const key = previewKey;
		if (!key) return '';
		const url = new URL(page.url);
		url.searchParams.set('preview', key);
		return url.toString();
	});

	const setPreviewParam = async (key: string | null, opts: { replace?: boolean } = {}) => {
		const url = new URL(page.url);
		const current = url.searchParams.get('preview');
		if (key) {
			if (current === key) return;
			url.searchParams.set('preview', key);
		} else {
			if (!current) return;
			url.searchParams.delete('preview');
		}
		const path = url.pathname + url.search + url.hash;
		if (opts.replace) {
			replaceState(path, page.state);
		} else {
			await goto(path, { keepFocus: true, noScroll: true });
		}
	};

	// On mount: hydrate the open release. If one exists and the URL doesn't
	// already have a matching preview key, swap it in via replaceState so SSR
	// reflects pending edits on the next data load.
	$effect(() => {
		void (async () => {
			await cmsStore.fetchOpenRelease(endpoint);
			const key = cmsStore.openRelease?.preview_key ?? null;
			const current = page.url.searchParams.get('preview');
			if (key && current !== key) {
				await setPreviewParam(key, { replace: true });
			} else if (!key && current) {
				await setPreviewParam(null, { replace: true });
			}
		})();
	});

	const onSave = async () => {
		const result = await cmsStore.save(endpoint);
		if (!result.ok) return;
		cmsStore.isEditing = false;
		seoOpen = false;
		const newKey = result.release?.preview_key ?? null;
		if (newKey) await setPreviewParam(newKey);
		await invalidateAll();
	};

	const onToggleEdit = () => {
		if (cmsStore.isEditing) {
			if (cmsStore.isDirty && !confirm('Discard unsaved changes?')) return;
			cmsStore.clearDrafts();
			cmsStore.isEditing = false;
			seoOpen = false;
		} else {
			cmsStore.isEditing = true;
		}
	};

	const onOpenPublish = () => {
		if (counts.total === 0) return;
		publishError = null;
		publishOpen = true;
	};

	const onConfirmPublish = async (name: string | undefined) => {
		publishing = true;
		publishError = null;
		try {
			const res = await fetch(`${endpoint}/release/publish`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(name ? { name } : {})
			});
			if (!res.ok) {
				publishError = (await res.text()) || 'Could not publish release.';
				return;
			}
			cmsStore.setOpenRelease(null);
			publishOpen = false;
			await setPreviewParam(null);
			await invalidateAll();
		} finally {
			publishing = false;
		}
	};

	const refreshAfterReleaseChange = async () => {
		const key = cmsStore.openRelease?.preview_key ?? null;
		if (key) await setPreviewParam(key);
		else await setPreviewParam(null);
		await invalidateAll();
	};

	const openNewPageDialog = (config: CmsNewPageConfig) => {
		newDialog = config;
		newPageError = null;
	};

	const closeNewPageDialog = () => {
		if (newPageCreating) return;
		newDialog = null;
		newPageError = null;
	};

	const handleCreate = async (rawValues: Record<string, string>) => {
		const target = newDialog;
		if (!target) return;
		newPageCreating = true;
		newPageError = null;
		try {
			let transformed: { params: Record<string, string>; metadata?: Record<string, unknown> };
			try {
				transformed = target.transform(rawValues);
			} catch {
				newPageError = 'Could not derive params from input.';
				return;
			}
			const { params: newParams, metadata = {} } = transformed;

			const createRes = await fetch(`${endpoint}/pages`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ routeId: target.routeId, params: newParams, metadata })
			});
			if (createRes.status === 409) {
				newPageError = 'A page with these values already exists.';
				return;
			}
			if (!createRes.ok) {
				newPageError = 'Could not create page.';
				return;
			}

			await cmsStore.fetchOpenRelease(endpoint);
			const key = cmsStore.openRelease?.preview_key ?? null;
			const url = new URL(resolveRouteUrl(target.routeId, newParams), page.url.origin);
			if (key) url.searchParams.set('preview', key);
			newDialog = null;
			pagesOpen = false;
			cmsStore.isEditing = true;
			await goto(url, { keepFocus: true, noScroll: true });
		} finally {
			newPageCreating = false;
		}
	};
</script>

<div class="vela-admin-bar">
<div class="cms-admin-bar">
	<span class="cms-admin-bar__brand">CMS</span>
	<div class="cms-admin-bar__group">
		{#if !cmsStore.isEditing}
			<button
				type="button"
				class="cms-btn"
				class:cms-btn--active={pagesOpen}
				onclick={() => (pagesOpen = !pagesOpen)}
			>
				Pages
			</button>
		{/if}
		{#if cmsStore.isEditing}
			<button
				type="button"
				class="cms-btn"
				class:cms-btn--active={seoOpen}
				onclick={() => (seoOpen = !seoOpen)}
			>
				SEO
			</button>
			<button type="button" class="cms-btn" onclick={onToggleEdit}>Cancel</button>
			<button type="button" class="cms-btn cms-btn--primary" onclick={onSave}>Save</button>
		{:else}
			{#if counts.total > 0}
				<button
					type="button"
					class="cms-btn"
					class:cms-btn--active={workingCopyOpen}
					onclick={() => (workingCopyOpen = !workingCopyOpen)}
				>
					{counts.pages > 0 ? `${counts.pages} page${counts.pages === 1 ? '' : 's'}` : ''}
					{#if counts.pages > 0 && counts.layouts > 0}·{/if}
					{counts.layouts > 0 ? `${counts.layouts} layout${counts.layouts === 1 ? '' : 's'}` : ''}
				</button>
				<button type="button" class="cms-btn cms-btn--primary" onclick={onOpenPublish}>
					Publish
				</button>
			{/if}
			<button
				type="button"
				class="cms-btn"
				class:cms-btn--active={historyOpen}
				onclick={() => (historyOpen = !historyOpen)}
			>
				History
			</button>
			<button type="button" class="cms-btn" onclick={onToggleEdit}>Edit</button>
		{/if}
	</div>
	<span class="cms-admin-bar__avatar" title={user.name}>{initials}</span>
	<Button
		variant="ghost"
		size="icon"
		aria-label="Close"
		onclick={onClose}
		class="vela:h-6 vela:w-6 vela:rounded-full vela:opacity-70 vela:hover:opacity-100"
	>
		×
	</Button>
</div>

{#if seoOpen}
	{#await import('./seo-panel.svelte') then { default: SeoPanel }}
		<SeoPanel onClose={() => (seoOpen = false)} />
	{/await}
{/if}

{#if workingCopyOpen}
	<WorkingCopyPanel
		{endpoint}
		{previewUrl}
		onClose={() => (workingCopyOpen = false)}
		onChanged={refreshAfterReleaseChange}
	/>
{/if}

{#if historyOpen}
	<HistoryPanel
		{endpoint}
		onClose={() => (historyOpen = false)}
		onChanged={refreshAfterReleaseChange}
	/>
{/if}

{#if pagesOpen}
	<PagesPanel
		{endpoint}
		{newPages}
		onClose={() => (pagesOpen = false)}
		onChanged={refreshAfterReleaseChange}
		onRequestNew={openNewPageDialog}
	/>
{/if}

{#if publishOpen && cmsStore.openRelease}
	<PublishDialog
		items={cmsStore.openRelease.items}
		{publishing}
		error={publishError}
		onConfirm={onConfirmPublish}
		onClose={() => {
			if (!publishing) publishOpen = false;
		}}
	/>
{/if}

{#if newDialog}
	<NewPageDialog
		config={newDialog}
		creating={newPageCreating}
		error={newPageError}
		onCreate={handleCreate}
		onClose={closeNewPageDialog}
	/>
{/if}
</div>

<style>
	.cms-admin-bar {
		position: fixed;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.375rem 0.75rem;
		border-radius: 9999px;
		background: rgba(20, 20, 20, 0.85);
		color: #fafafa;
		backdrop-filter: blur(8px);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
		z-index: 9999;
		font-family:
			ui-sans-serif,
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			sans-serif;
		font-size: 0.85rem;
	}
	.cms-admin-bar__brand {
		font-weight: 600;
		letter-spacing: 0.05em;
		font-size: 0.75rem;
		opacity: 0.7;
		text-transform: uppercase;
	}
	.cms-admin-bar__group {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.cms-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.375rem 0.75rem;
		border-radius: 9999px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.06);
		color: inherit;
		cursor: pointer;
		font: inherit;
		line-height: 1;
	}
	.cms-btn:hover {
		background: rgba(255, 255, 255, 0.14);
	}
	.cms-btn--active {
		background: rgba(255, 255, 255, 0.18);
	}
	.cms-btn--primary {
		background: #fafafa;
		color: #111;
		border-color: transparent;
	}
	.cms-btn--primary:hover {
		background: #fff;
	}
	.cms-admin-bar__avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 9999px;
		background: rgba(255, 255, 255, 0.12);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}
	:global(.cms-dialog) {
		padding: 0;
		border: 0;
		border-radius: 0.75rem;
		max-width: 32rem;
		width: calc(100% - 2rem);
		color: canvastext;
		background: canvas;
	}
	:global(.cms-dialog::backdrop) {
		background: rgba(0, 0, 0, 0.4);
	}
	:global(.cms-dialog__body) {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	:global(.cms-dialog h2) {
		margin: 0;
		font-size: 1.125rem;
	}
	:global(.cms-dialog__fields) {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	:global(.cms-dialog label) {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.8rem;
	}
	:global(.cms-dialog label > span) {
		opacity: 0.7;
	}
	:global(.cms-dialog input) {
		padding: 0.4rem 0.6rem;
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: 0.375rem;
		background: canvas;
		color: inherit;
		font: inherit;
	}
	:global(.cms-dialog__error) {
		margin: 0;
		padding: 0.5rem 0.6rem;
		border-radius: 0.375rem;
		background: rgba(220, 60, 60, 0.12);
		color: #b32d2d;
		font-size: 0.8rem;
	}
	:global(.cms-dialog footer) {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	:global(.cms-btn--ghost) {
		border: 0;
		background: transparent;
		color: inherit;
	}
	:global(.cms-btn--ghost:hover) {
		background: rgba(0, 0, 0, 0.06);
	}
</style>
