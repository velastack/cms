<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { cmsStore } from '../cms/cms-store.svelte.js';
	import type { CmsPagePointer, CmsPayload } from '../cms/scope.js';
	import { clickOutside } from './click-outside.js';

	type Props = {
		user: { id: string; name: string };
		endpoint: string;
		onClose: () => void;
	};
	let { user, endpoint, onClose }: Props = $props();

	type VersionSummary = {
		version: number;
		status: 'draft' | 'published';
		preview_key: string;
	};

	const initials = $derived(
		user.name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('')
	);

	const ssrPagePtr = $derived<CmsPagePointer | null>(
		(page.data?.cms as CmsPayload | undefined)?.page ?? null
	);
	const paramsEqual = (a: Record<string, string>, b: Record<string, string>) => {
		const aKeys = Object.keys(a);
		if (aKeys.length !== Object.keys(b).length) return false;
		for (const k of aKeys) if (a[k] !== b[k]) return false;
		return true;
	};
	const pagePtr = $derived.by<CmsPagePointer | null>(() => {
		const ovr = cmsStore.overlay;
		if (
			ovr &&
			ssrPagePtr &&
			ovr.scope.scopeId === ssrPagePtr.scopeId &&
			paramsEqual(ovr.scope.params, ssrPagePtr.params)
		) {
			return ovr.pointer;
		}
		return ssrPagePtr;
	});

	let seoOpen = $state(false);
	let versionsOpen = $state(false);
	let versions = $state<VersionSummary[]>([]);
	let versionsLoading = $state(false);
	let versionsLoadedFor = $state<string | null>(null);

	const latestPublishedVersion = $derived(
		versions.reduce<number | null>(
			(max, v) =>
				v.status === 'published' && (max == null || v.version > max) ? v.version : max,
			null
		)
	);

	const loadAndApplyVersion = async (
		ptr: CmsPagePointer,
		target: VersionSummary,
		opts: { replaceState?: boolean } = {}
	) => {
		const docQs = new URLSearchParams({
			routeId: ptr.routeId,
			params: JSON.stringify(ptr.params),
			version: String(target.version),
			preview: target.preview_key
		});
		const docRes = await fetch(`${endpoint}/docs?${docQs}`);
		if (!docRes.ok) return;
		const doc = (await docRes.json()) as {
			version: number;
			status: 'draft' | 'published';
			contents: Record<string, unknown>;
		};

		// Skip if the user navigated away while we were fetching.
		const current = (page.data?.cms as CmsPayload | undefined)?.page;
		if (!current || current.scopeId !== ptr.scopeId || !paramsEqual(current.params, ptr.params)) {
			return;
		}

		const { _metadata: _omit, ...fields } = doc.contents as Record<string, unknown>;
		cmsStore.setOverlay(
			{ scopeId: ptr.scopeId, routeId: ptr.routeId, params: ptr.params },
			fields,
			{
				scopeId: ptr.scopeId,
				routeId: ptr.routeId,
				params: ptr.params,
				version: doc.version,
				status: doc.status
			}
		);

		const url = new URL(page.url);
		url.searchParams.set('version', String(target.version));
		url.searchParams.set('preview', target.preview_key);
		await goto(url, { replaceState: opts.replaceState, keepFocus: true, noScroll: true });
	};

	const navigateToVersion = (target: VersionSummary) => {
		if (!pagePtr) return;
		void loadAndApplyVersion(pagePtr, target);
	};

	const versionsCacheKey = (ptr: CmsPagePointer) => `${ptr.routeId}|${JSON.stringify(ptr.params)}`;

	const loadVersions = async () => {
		// Defer past the synchronous body of any calling $effect so reads of
		// reactive state below don't establish dependencies.
		await Promise.resolve();
		if (!pagePtr) return;
		const cacheKey = versionsCacheKey(pagePtr);
		if (versionsLoadedFor === cacheKey) return;
		versionsLoading = true;
		try {
			const qs = new URLSearchParams({
				routeId: pagePtr.routeId,
				params: JSON.stringify(pagePtr.params)
			});
			const res = await fetch(`${endpoint}/versions?${qs}`);
			if (res.ok) {
				const data = (await res.json()) as { versions: VersionSummary[] };
				versions = data.versions;
				versionsLoadedFor = cacheKey;
			}
		} finally {
			versionsLoading = false;
		}
	};

	const onToggleVersions = async () => {
		if (versionsOpen) {
			versionsOpen = false;
			return;
		}
		versionsOpen = true;
		await loadVersions();
	};

	const autoLoadDraft = async (ptr: CmsPagePointer) => {
		// Defer past the synchronous body of the calling $effect so reads of
		// reactive state below don't establish dependencies.
		await Promise.resolve();
		if (cmsStore.isEditing) return;
		if (page.url.searchParams.has('version')) {
			// SSR resolved a specific version; clear any stale overlay shadowing it.
			cmsStore.clearOverlay();
			return;
		}

		const baseQs = new URLSearchParams({
			routeId: ptr.routeId,
			params: JSON.stringify(ptr.params)
		});
		const versRes = await fetch(`${endpoint}/versions?${baseQs}`);
		if (!versRes.ok) return;
		const { versions: list } = (await versRes.json()) as { versions: VersionSummary[] };
		if (list.length === 0) return;
		let latest = list[0];
		for (const v of list) if (v.version > latest.version) latest = v;
		if (latest.status !== 'draft') {
			cmsStore.clearOverlay();
			return;
		}

		await loadAndApplyVersion(ptr, latest, { replaceState: true });
	};

	$effect(() => {
		const ptr = ssrPagePtr;
		if (!ptr) return;
		void autoLoadDraft(ptr);
		void loadVersions();
	});

	const onPublish = async () => {
		if (!pagePtr || pagePtr.status !== 'draft') return;
		const res = await fetch(`${endpoint}/versions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				action: 'publish',
				routeId: pagePtr.routeId,
				params: pagePtr.params,
				version: pagePtr.version
			})
		});
		if (!res.ok) return;
		cmsStore.clearOverlay();
		versionsLoadedFor = null;
		await invalidateAll();
	};

	const onRevert = async () => {
		if (!pagePtr) return;
		const res = await fetch(`${endpoint}/versions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				action: 'revert',
				routeId: pagePtr.routeId,
				params: pagePtr.params,
				version: pagePtr.version
			})
		});
		if (!res.ok) return;
		const { version: newDraft } = (await res.json()) as { version: VersionSummary };
		versionsLoadedFor = null;
		await loadAndApplyVersion(pagePtr, newDraft);
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

	const onSave = async () => {
		const baseVersion = pagePtr?.version ?? null;
		const result = await cmsStore.save(endpoint, pagePtr);
		if (!result.ok) return;
		cmsStore.isEditing = false;
		seoOpen = false;
		// Invalidate page data so the saved version (or fork) appears.
		const newVersion = result.pageVersion;
		if (newVersion && newVersion.version !== baseVersion) {
			versionsLoadedFor = null;
			const url = new URL(page.url);
			url.searchParams.set('version', String(newVersion.version));
			url.searchParams.set('preview', newVersion.preview_key);
			await goto(url, { keepFocus: true, noScroll: true, invalidateAll: true });
		} else {
			versionsLoadedFor = null;
			await invalidateAll();
		}
	};
</script>

<div class="cms-admin-bar">
	<span class="cms-admin-bar__brand">CMS</span>
	<div class="cms-admin-bar__group">
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
			{#if pagePtr}
				<div class="cms-menu" use:clickOutside={() => (versionsOpen = false)}>
					<button
						type="button"
						class="cms-btn"
						class:cms-btn--active={versionsOpen}
						onclick={onToggleVersions}
					>
						v{pagePtr.version}
						{#if pagePtr.status === 'draft' || latestPublishedVersion == null || pagePtr.version === latestPublishedVersion}
							<span class="cms-pill cms-pill--{pagePtr.status}">{pagePtr.status}</span>
						{/if}
					</button>
					{#if versionsOpen}
						<ul class="cms-menu__list" role="menu">
							{#if versionsLoading && versions.length === 0}
								<li class="cms-menu__empty">Loading…</li>
							{:else if versions.length === 0}
								<li class="cms-menu__empty">No versions</li>
							{:else}
								{#each versions as v (v.version)}
									<li>
										<button
											type="button"
											class="cms-menu__item"
											class:cms-menu__item--active={v.version === pagePtr.version}
											onclick={() => {
												versionsOpen = false;
												navigateToVersion(v);
											}}
										>
											<span>v{v.version}</span>
											{#if v.status === 'draft' || v.version === latestPublishedVersion}
												<span class="cms-pill cms-pill--{v.status}">{v.status}</span>
											{/if}
										</button>
									</li>
								{/each}
							{/if}
						</ul>
					{/if}
				</div>
			{/if}
			{#if pagePtr?.status === 'draft'}
				<button type="button" class="cms-btn cms-btn--primary" onclick={onPublish}>Publish</button>
			{/if}
			{#if pagePtr && latestPublishedVersion != null && pagePtr.version < latestPublishedVersion}
				<button type="button" class="cms-btn" onclick={onRevert}>Revert</button>
			{/if}
			<button type="button" class="cms-btn" onclick={onToggleEdit}>Edit</button>
		{/if}
	</div>
	<span class="cms-admin-bar__avatar" title={user.name}>{initials}</span>
	<button type="button" class="cms-admin-bar__close" aria-label="Close" onclick={onClose}>×</button>
</div>

{#if seoOpen}
	{#await import('./seo-panel.svelte') then { default: SeoPanel }}
		<SeoPanel onClose={() => (seoOpen = false)} />
	{/await}
{/if}

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
	.cms-menu {
		position: relative;
		display: inline-flex;
	}
	.cms-menu__list {
		position: absolute;
		top: calc(100% + 0.375rem);
		left: 0;
		min-width: 12rem;
		margin: 0;
		padding: 0.25rem;
		list-style: none;
		background: rgba(20, 20, 20, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 0.5rem;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
		z-index: 10000;
	}
	.cms-menu__item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		width: 100%;
		padding: 0.4rem 0.6rem;
		border: none;
		background: transparent;
		color: inherit;
		cursor: pointer;
		font: inherit;
		border-radius: 0.375rem;
		text-align: left;
	}
	.cms-menu__item:hover {
		background: rgba(255, 255, 255, 0.08);
	}
	.cms-menu__item--active {
		background: rgba(255, 255, 255, 0.12);
	}
	.cms-menu__empty {
		padding: 0.5rem 0.6rem;
		opacity: 0.6;
		font-size: 0.8rem;
	}
	.cms-pill {
		display: inline-flex;
		align-items: center;
		padding: 0.05rem 0.4rem;
		border-radius: 9999px;
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.cms-pill--published {
		background: rgba(80, 200, 120, 0.18);
		color: #a8eecb;
	}
	.cms-pill--draft {
		background: rgba(240, 180, 60, 0.2);
		color: #f5d27a;
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
	.cms-admin-bar__close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 9999px;
		border: none;
		background: rgba(255, 255, 255, 0.08);
		color: inherit;
		cursor: pointer;
		font: inherit;
		font-size: 1rem;
		line-height: 1;
		padding: 0;
		opacity: 0.7;
	}
	.cms-admin-bar__close:hover {
		background: rgba(255, 255, 255, 0.18);
		opacity: 1;
	}
</style>
