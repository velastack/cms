<script lang="ts">
	import { afterNavigate, goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { cmsStore } from '../cms/cms-store.svelte.js';
	import type { CmsPayload, CmsScopeEntry } from '../cms/scope.js';
	import './admin-bar.css';
	import HistoryPanel from './history-panel.svelte';
	import NewPageChooserDialog from './new-page-chooser-dialog.svelte';
	import type { CmsNewPageConfig } from './new-page-config.js';
	import NewPageDialog from './new-page-dialog.svelte';
	import PagesPanel from './pages-panel.svelte';
	import PublishDialog from './publish-dialog.svelte';
	import { resolveRouteOnlyParams, resolveRouteUrl } from './resolve-route.js';
	import StatusPill from './status-pill.svelte';
	import { Button } from './ui/button/index.js';
	import * as Menubar from './ui/menubar/index.js';
	import UserAvatar from './user-avatar.svelte';

	const menubarTriggerBase =
		'vela:bg-transparent vela:hover:bg-[var(--cms-bar-bg-hover)] vela:aria-expanded:bg-[var(--cms-bar-bg-hover)] vela:rounded-md vela:px-2 vela:py-1 vela:text-[13px] vela:font-medium vela:cursor-pointer';
	const menubarContentClass =
		'vela:bg-bar-bg vela:text-bar-text vela:border vela:border-[var(--cms-bar-divider)] vela:shadow-[0_8px_24px_rgba(0,0,0,0.35)]';

	// Editing dims the menubar — meta-actions are subordinated while editing.
	const menubarTriggerClass = $derived(
		cmsStore.isEditing
			? `${menubarTriggerBase} vela:text-bar-text-tertiary vela:hover:text-bar-text-secondary vela:aria-expanded:text-bar-text-secondary`
			: `${menubarTriggerBase} vela:text-bar-text-secondary vela:hover:text-bar-text vela:aria-expanded:text-bar-text`
	);

	const menuContentClassExt = `${menubarContentClass} vela:min-w-56 vela:p-1.5`;
	const menuItemClass =
		'vela:flex vela:items-center vela:gap-2 vela:px-2 vela:py-1.5 vela:rounded-md vela:text-[13px] vela:cursor-pointer vela:outline-none vela:focus:bg-[var(--cms-bar-bg-hover)] vela:focus:text-bar-text vela:data-disabled:opacity-40 vela:data-disabled:pointer-events-none';
	const menuItemDestructiveClass =
		'vela:flex vela:items-center vela:gap-2 vela:px-2 vela:py-1.5 vela:rounded-md vela:text-[13px] vela:cursor-pointer vela:outline-none vela:text-[#e88a8a] vela:focus:bg-[#3a1f1f] vela:focus:text-[#ffb3b3] vela:data-disabled:opacity-40 vela:data-disabled:pointer-events-none';
	const menuLabelClass =
		'vela:px-2 vela:pt-2.5 vela:pb-1 vela:text-[10px] vela:font-semibold vela:uppercase vela:tracking-widest vela:text-bar-text-tertiary';
	const menuShortcutClass =
		'vela:ml-auto vela:text-[11px] vela:text-bar-text-tertiary vela:font-mono vela:tracking-normal';
	const menuSeparatorClass =
		'vela:my-1 vela:h-px vela:bg-[var(--cms-bar-divider)]';
	const menuCheckIndicatorClass =
		'vela:flex vela:items-center vela:gap-2 vela:px-2 vela:py-1.5 vela:pl-7 vela:rounded-md vela:text-[13px] vela:cursor-pointer vela:outline-none vela:focus:bg-[var(--cms-bar-bg-hover)] vela:focus:text-bar-text vela:data-disabled:opacity-40';

	type Props = {
		user: { id: string; name: string };
		endpoint: string;
		newPages: CmsNewPageConfig[];
		onClose: () => void;
	};
	let { user, endpoint, newPages, onClose }: Props = $props();

	let seoOpen = $state(false);
	let historyOpen = $state(false);
	let pagesOpen = $state(false);
	let publishOpen = $state(false);
	let chooserOpen = $state(false);
	const anyPanelOpen = $derived(
		seoOpen || historyOpen || pagesOpen || publishOpen || chooserOpen
	);
	let publishing = $state(false);
	let publishError = $state<string | null>(null);

	let newDialog = $state<CmsNewPageConfig | null>(null);
	let newPageError = $state<string | null>(null);
	let newPageCreating = $state(false);

	// Only one panel/dialog open at a time. Every "open X" routes through here.
	const closeAllPanels = () => {
		seoOpen = false;
		historyOpen = false;
		pagesOpen = false;
		publishOpen = false;
		chooserOpen = false;
		newDialog = null;
		newPageError = null;
	};

	const counts = $derived(cmsStore.workingCopyCounts);
	const previewKey = $derived(cmsStore.openRelease?.preview_key ?? null);

	const previewUrl = $derived.by(() => {
		const key = previewKey;
		if (!key) return '';
		const url = new URL(page.url);
		url.searchParams.set('preview', key);
		return url.toString();
	});

	const currentScopes = (): CmsScopeEntry[] => {
		const cms = page.data.cms as CmsPayload | undefined;
		return cms ? Object.values(cms.scopes) : [];
	};

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

	// On mount: hydrate the open release, then sync the URL's `?preview=` to
	// the release's preview key (or strip it). Apply a fresh client-side
	// overlay by fetching `${endpoint}/docs` for each current-route scope —
	// this is what makes the editor experience work on static-export sites
	// where SvelteKit's server load can't be re-run. With no release, leave
	// the overlay empty: `page.data.cms.docs` is the published source.
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
			if (key) {
				await cmsStore.loadAndApplyOverlay(endpoint, currentScopes(), key, { reset: true });
			} else {
				cmsStore.clearOverlay();
			}
		})();
	});

	// Re-apply the overlay on every internal navigation. SvelteKit may strip
	// the `?preview=` param when nav targets aren't preserve-params links, so
	// we reapply it via replaceState too. Merge (not reset) so unchanged
	// layout overlays keep showing while new-page-scope fetches resolve.
	afterNavigate(() => {
		const key = cmsStore.openRelease?.preview_key ?? null;
		if (!key) return;
		const url = new URL(page.url);
		if (url.searchParams.get('preview') !== key) {
			url.searchParams.set('preview', key);
			replaceState(url.pathname + url.search + url.hash, page.state);
		}
		void cmsStore.loadAndApplyOverlay(endpoint, currentScopes(), key);
	});

	const onSave = async () => {
		const result = await cmsStore.save(endpoint);
		if (!result.ok) return;
		cmsStore.isEditing = false;
		seoOpen = false;
		const newKey = result.release?.preview_key ?? null;
		if (newKey) await setPreviewParam(newKey, { replace: true });
		await cmsStore.loadAndApplyOverlay(endpoint, currentScopes(), newKey);
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
		closeAllPanels();
		publishError = null;
		publishOpen = true;
	};

	const onOpenPages = () => {
		closeAllPanels();
		pagesOpen = true;
	};

	const onOpenHistory = () => {
		closeAllPanels();
		historyOpen = true;
	};

	const onConfirmPublish = async (name: string | undefined) => {
		publishing = true;
		publishError = null;
		try {
			const body: { name?: string } = {};
			if (name) body.name = name;
			const res = await fetch(`${endpoint}/release/publish`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				publishError = (await res.text()) || 'Could not publish release.';
				return;
			}
			await cmsStore.fetchOpenRelease(endpoint);
			publishOpen = false;
			const newKey = cmsStore.openRelease?.preview_key ?? null;
			await setPreviewParam(newKey, { replace: true });
			// Refetch `/docs` to pick up the just-published content as overlay.
			// `page.data.cms.docs` was loaded against the pre-publish published
			// state and we can't re-run server load on static-export sites; the
			// fresh overlay masks that staleness.
			await cmsStore.loadAndApplyOverlay(endpoint, currentScopes(), newKey, { reset: true });
		} finally {
			publishing = false;
		}
	};

	const refreshAfterReleaseChange = async () => {
		const key = cmsStore.openRelease?.preview_key ?? null;
		await setPreviewParam(key, { replace: true });
		await cmsStore.loadAndApplyOverlay(endpoint, currentScopes(), key, { reset: true });
	};

	// View toggles + bar position. Local state — Highlight/DraftMarkers/Grid have
	// no functional effect until step 7's editing affordances land; Preview-as is
	// also visual-only for now. Position swaps the bar between top and bottom.
	let highlightSlots = $state(true);
	let showDraftMarkers = $state(true);
	let showGrid = $state(false);
	let previewAs = $state<'desktop' | 'tablet' | 'mobile' | 'signed-out'>('desktop');
	let barPosition = $state<'top' | 'bottom'>('top');

	const currentPageItems = $derived(
		(cmsStore.openRelease?.items ?? []).filter((item) => {
			if (item.kind === 'layout') return false;
			try {
				return resolveRouteUrl(item.routeId, item.params) === page.url.pathname;
			} catch {
				return false;
			}
		})
	);
	const hasCurrentPageDrafts = $derived(currentPageItems.length > 0);

	const onCopyPreviewLink = async () => {
		if (!previewUrl) return;
		try {
			await navigator.clipboard.writeText(previewUrl);
		} catch {
			/* clipboard may be unavailable; swallow silently */
		}
	};

	const onOpenInNewTab = () => {
		const url = previewUrl || page.url.toString();
		window.open(url, '_blank', 'noopener');
	};

	const onRegeneratePreviewKey = async () => {
		const res = await fetch(`${endpoint}/release/preview-key`, { method: 'POST' });
		if (!res.ok) return;
		await cmsStore.fetchOpenRelease(endpoint);
		await refreshAfterReleaseChange();
	};

	const onDiscardAllChanges = async () => {
		if (!confirm('Discard every pending edit in your working copy?')) return;
		const res = await fetch(`${endpoint}/release/discard`, { method: 'POST' });
		if (!res.ok) return;
		cmsStore.setOpenRelease(null);
		cmsStore.clearDrafts();
		await refreshAfterReleaseChange();
	};

	const onDiscardCurrentPage = async () => {
		if (currentPageItems.length === 0) return;
		if (!confirm('Discard pending edits on this page?')) return;
		for (const item of currentPageItems) {
			if (item.kind !== 'page') continue;
			await fetch(`${endpoint}/release/items`, {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ kind: 'page', routeId: item.routeId, params: item.params })
			});
		}
		await cmsStore.fetchOpenRelease(endpoint);
		await refreshAfterReleaseChange();
	};

	// "Publish this page…" and "Review & publish…" open the same modal; the
	// user filters down to the current page via the per-row checkboxes.
	const onPublishThisPage = onOpenPublish;

	const onNewFromTemplate = (config: CmsNewPageConfig) => {
		openNewPageDialog(config);
	};

	// "New page…" always opens the chooser. The Site → Create submenu has
	// `New from /xxx` items for direct-to-template entry; this stays generic.
	const onNewPage = () => {
		if (newPages.length === 0) return;
		closeAllPanels();
		chooserOpen = true;
	};

	const onHideBar = () => onClose();
	const onShareLink = onCopyPreviewLink;

	// Edit SEO is available outside edit mode — opening the panel implicitly
	// enters edit mode so the metadata fields are immediately editable.
	const onOpenSeo = () => {
		closeAllPanels();
		cmsStore.isEditing = true;
		seoOpen = true;
	};

	// Stubs for actions whose backing UIs don't exist yet. Wired so the menu
	// items aren't dead-on-arrival — they'll be hooked up in later steps.
	const onGoToPage = () => {
		// Step 4: command-palette page jumper.
	};
	const onSiteSettings = () => {
		// Future: site-settings panel.
	};
	const onShowKeyboardShortcuts = () => {
		// Future: cheat sheet.
	};

	// Global keyboard shortcuts (DESIGN.md §9). Single-letter keys only fire
	// when no input is focused; modifier-keyed shortcuts always fire.
	$effect(() => {
		const isEditableTarget = (el: EventTarget | null): boolean => {
			if (!(el instanceof HTMLElement)) return false;
			const tag = el.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
			if (el.isContentEditable) return true;
			return false;
		};

		const handler = (e: KeyboardEvent) => {
			const meta = e.metaKey || e.ctrlKey;
			const shift = e.shiftKey;
			const editable = isEditableTarget(e.target);

			if (meta && shift) {
				const k = e.key.toLowerCase();
				if (k === 'p') {
					e.preventDefault();
					onOpenPublish();
				}
				return;
			}
			if (meta) {
				const k = e.key.toLowerCase();
				if (k === 's' && cmsStore.isEditing) {
					e.preventDefault();
					void onSave();
				} else if (k === 'p') {
					e.preventDefault();
					onOpenPages();
				} else if (k === 'h') {
					e.preventDefault();
					onOpenHistory();
				} else if (k === 'i') {
					e.preventDefault();
					onOpenSeo();
				} else if (k === 'n') {
					e.preventDefault();
					onNewPage();
				} else if (k === '.') {
					e.preventDefault();
					onClose();
				} else if (e.key === 'Enter') {
					e.preventDefault();
					onOpenInNewTab();
				}
				return;
			}

			// Single-letter shortcuts gated on no input being focused.
			if (editable) return;
			if (e.key === 'Escape' && cmsStore.isEditing && !anyPanelOpen) {
				// When a panel is open, Escape closes the panel (each panel
				// owns its own listener); the bar should not also exit edit
				// mode out from under it.
				e.preventDefault();
				onToggleEdit();
			} else if (e.key === 'e' || e.key === 'E') {
				e.preventDefault();
				onToggleEdit();
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	});

	const openNewPageDialog = (config: CmsNewPageConfig) => {
		closeAllPanels();
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
<div
	class="vela:fixed vela:left-1/2 vela:-translate-x-1/2 vela:z-[9999]
		vela:flex vela:items-center vela:justify-between vela:gap-3
		vela:w-full vela:max-w-[560px] vela:mx-4 vela:sm:mx-auto
		vela:h-12 vela:px-3 vela:rounded-full
		vela:bg-bar-bg vela:text-bar-text
		vela:shadow-[0_8px_24px_rgba(0,0,0,0.25)]
		{barPosition === 'bottom' ? 'vela:bottom-4' : 'vela:top-4'}"
>
	<div class="vela:flex vela:items-center vela:gap-3">
		<span
			class="vela:text-[11px] vela:font-semibold vela:tracking-wider vela:uppercase
				vela:text-bar-text-tertiary"
		>
			CMS
		</span>

		{#if cmsStore.isEditing}
			<StatusPill variant="edit">Editing</StatusPill>
		{:else if counts.total > 0}
			<StatusPill variant="warn" onclick={onOpenPages}>
				{counts.total}
				{counts.total === 1 ? 'page draft' : 'pages draft'}
			</StatusPill>
		{:else}
			<StatusPill variant="clean">All published</StatusPill>
		{/if}
	</div>

	<div class="vela:flex vela:items-center vela:gap-2">
		{#if cmsStore.isEditing}
			<Button variant="ghost" size="pill" onclick={onToggleEdit}>Cancel</Button>
			<Button size="pill" onclick={onSave}>Save</Button>
		{:else if counts.total > 0}
			<Button size="pill" onclick={onOpenPublish}>Publish…</Button>
		{/if}

		<Menubar.Root
			class="vela:bg-transparent vela:border-0 vela:p-0 vela:gap-0.5 vela:h-auto vela:rounded-none"
		>
			<Menubar.Menu>
				<Menubar.Trigger class={menubarTriggerClass}>Page</Menubar.Trigger>
				<Menubar.Content class={menuContentClassExt} align="end">
					<Menubar.Item
						class={menuItemClass}
						onSelect={onToggleEdit}
						disabled={cmsStore.isEditing}
					>
						Edit
						<Menubar.Shortcut class={menuShortcutClass}>E</Menubar.Shortcut>
					</Menubar.Item>
					<Menubar.Item class={menuItemClass} onSelect={onOpenSeo}>
						Edit SEO &amp; metadata
						<Menubar.Shortcut class={menuShortcutClass}>⌘I</Menubar.Shortcut>
					</Menubar.Item>
					<Menubar.Separator class={menuSeparatorClass} />
					<Menubar.Item
						class={menuItemClass}
						onSelect={onCopyPreviewLink}
						disabled={!previewUrl}
					>
						Copy preview link
					</Menubar.Item>
					<Menubar.Item class={menuItemClass} onSelect={onOpenInNewTab}>
						Open in new tab
						<Menubar.Shortcut class={menuShortcutClass}>⌘↵</Menubar.Shortcut>
					</Menubar.Item>
					<Menubar.Separator class={menuSeparatorClass} />
					<Menubar.Item
						class={menuItemClass}
						onSelect={onDiscardCurrentPage}
						disabled={!hasCurrentPageDrafts}
					>
						Discard changes
					</Menubar.Item>
					<Menubar.Item
						class={menuItemClass}
						onSelect={onPublishThisPage}
						disabled={!hasCurrentPageDrafts}
					>
						Publish this page…
						<Menubar.Shortcut class={menuShortcutClass}>⌘⇧P</Menubar.Shortcut>
					</Menubar.Item>
				</Menubar.Content>
			</Menubar.Menu>

			<Menubar.Menu>
				<Menubar.Trigger class={menubarTriggerClass}>Site</Menubar.Trigger>
				<Menubar.Content class={menuContentClassExt} align="end">
					<Menubar.Label class={menuLabelClass}>Navigate</Menubar.Label>
					<Menubar.Item class={menuItemClass} onSelect={onOpenPages}>
						All pages…
						<Menubar.Shortcut class={menuShortcutClass}>⌘P</Menubar.Shortcut>
					</Menubar.Item>
					<Menubar.Item class={menuItemClass} onSelect={onGoToPage} disabled>
						Go to page…
						<Menubar.Shortcut class={menuShortcutClass}>⌘K</Menubar.Shortcut>
					</Menubar.Item>

					<Menubar.Label class={menuLabelClass}>Create</Menubar.Label>
					<Menubar.Item
						class={menuItemClass}
						onSelect={onNewPage}
						disabled={newPages.length === 0}
					>
						New page…
						<Menubar.Shortcut class={menuShortcutClass}>⌘N</Menubar.Shortcut>
					</Menubar.Item>
					{#each newPages as cfg (cfg.routeId)}
						<Menubar.Item class={menuItemClass} onSelect={() => onNewFromTemplate(cfg)}>
							New from
							<span class="vela:font-mono vela:text-[12px] vela:text-bar-text-secondary">
								{resolveRouteOnlyParams(cfg.routeId)}
							</span>
						</Menubar.Item>
					{/each}

					<Menubar.Label class={menuLabelClass}>Working copy</Menubar.Label>
					<Menubar.Item
						class={menuItemClass}
						onSelect={onOpenPublish}
						disabled={counts.total === 0}
					>
						Review &amp; publish…
						{#if counts.total > 0}
							<span
								class="vela:ml-auto vela:flex vela:items-center vela:gap-2"
							>
								<span
									class="vela:inline-flex vela:items-center vela:justify-center
										vela:min-w-[18px] vela:h-[18px] vela:px-1 vela:rounded-full
										vela:text-[10px] vela:font-semibold
										vela:bg-[var(--cms-status-warn-bg)]
										vela:text-[var(--cms-status-warn-text)]"
								>{counts.total}</span>
								<span class={menuShortcutClass + ' vela:ml-0'}>⌘⇧P</span>
							</span>
						{:else}
							<Menubar.Shortcut class={menuShortcutClass}>⌘⇧P</Menubar.Shortcut>
						{/if}
					</Menubar.Item>
					<Menubar.Item
						class={menuItemClass}
						onSelect={onShareLink}
						disabled={!previewUrl}
					>
						Share preview link
					</Menubar.Item>
					<Menubar.Item
						class={menuItemClass}
						onSelect={onRegeneratePreviewKey}
						disabled={!previewUrl}
					>
						Regenerate preview key
					</Menubar.Item>
					<Menubar.Item
						class={menuItemDestructiveClass}
						onSelect={onDiscardAllChanges}
						disabled={counts.total === 0}
					>
						Discard all changes…
					</Menubar.Item>

					<Menubar.Label class={menuLabelClass}>History</Menubar.Label>
					<Menubar.Item class={menuItemClass} onSelect={onOpenHistory}>
						Recent releases…
						<Menubar.Shortcut class={menuShortcutClass}>⌘H</Menubar.Shortcut>
					</Menubar.Item>
					<Menubar.Item class={menuItemClass} onSelect={onOpenHistory}>
						Revert to release…
					</Menubar.Item>

					<Menubar.Separator class={menuSeparatorClass} />
					<Menubar.Item class={menuItemClass} onSelect={onSiteSettings} disabled>
						Site settings
						<Menubar.Shortcut class={menuShortcutClass}>⌘,</Menubar.Shortcut>
					</Menubar.Item>
				</Menubar.Content>
			</Menubar.Menu>

			<Menubar.Menu>
				<Menubar.Trigger class={menubarTriggerClass}>View</Menubar.Trigger>
				<Menubar.Content class={menuContentClassExt} align="end">
					<Menubar.Label class={menuLabelClass}>Bar</Menubar.Label>
					<Menubar.Item class={menuItemClass} onSelect={onHideBar}>
						Hide bar
						<Menubar.Shortcut class={menuShortcutClass}>⌘.</Menubar.Shortcut>
					</Menubar.Item>
					<Menubar.Sub>
						<Menubar.SubTrigger class={menuItemClass}>Position</Menubar.SubTrigger>
						<Menubar.SubContent class={menuContentClassExt}>
							<Menubar.Item
								class={menuCheckIndicatorClass}
								onSelect={() => (barPosition = 'top')}
							>
								<span class="vela:absolute vela:left-2">
									{barPosition === 'top' ? '✓' : ''}
								</span>
								Top
							</Menubar.Item>
							<Menubar.Item
								class={menuCheckIndicatorClass}
								onSelect={() => (barPosition = 'bottom')}
							>
								<span class="vela:absolute vela:left-2">
									{barPosition === 'bottom' ? '✓' : ''}
								</span>
								Bottom
							</Menubar.Item>
						</Menubar.SubContent>
					</Menubar.Sub>

					<Menubar.Label class={menuLabelClass}>Page indicators</Menubar.Label>
					<Menubar.CheckboxItem
						class={menuCheckIndicatorClass}
						bind:checked={highlightSlots}
					>
						Highlight editable areas
						<Menubar.Shortcut class={menuShortcutClass}>⌘⇧E</Menubar.Shortcut>
					</Menubar.CheckboxItem>
					<Menubar.CheckboxItem
						class={menuCheckIndicatorClass}
						bind:checked={showDraftMarkers}
					>
						Show draft markers on links
					</Menubar.CheckboxItem>
					<Menubar.CheckboxItem
						class={menuCheckIndicatorClass}
						bind:checked={showGrid}
					>
						Show grid &amp; spacing
						<Menubar.Shortcut class={menuShortcutClass}>⌘G</Menubar.Shortcut>
					</Menubar.CheckboxItem>

					<Menubar.Label class={menuLabelClass}>Preview as</Menubar.Label>
					<Menubar.RadioGroup bind:value={previewAs}>
						<Menubar.RadioItem class={menuCheckIndicatorClass} value="desktop">
							Desktop
						</Menubar.RadioItem>
						<Menubar.RadioItem class={menuCheckIndicatorClass} value="tablet">
							Tablet
						</Menubar.RadioItem>
						<Menubar.RadioItem class={menuCheckIndicatorClass} value="mobile">
							Mobile
						</Menubar.RadioItem>
						<Menubar.RadioItem class={menuCheckIndicatorClass} value="signed-out">
							Signed-out visitor
						</Menubar.RadioItem>
					</Menubar.RadioGroup>

					<Menubar.Label class={menuLabelClass}>Appearance</Menubar.Label>
					<Menubar.Sub>
						<Menubar.SubTrigger class={menuItemClass}>Theme</Menubar.SubTrigger>
						<Menubar.SubContent class={menuContentClassExt}>
							<Menubar.Item class={menuItemClass} disabled>System</Menubar.Item>
							<Menubar.Item class={menuItemClass} disabled>Light</Menubar.Item>
							<Menubar.Item class={menuItemClass} disabled>Dark</Menubar.Item>
						</Menubar.SubContent>
					</Menubar.Sub>

					<Menubar.Separator class={menuSeparatorClass} />
					<Menubar.Item class={menuItemClass} onSelect={onShowKeyboardShortcuts} disabled>
						Keyboard shortcuts…
						<Menubar.Shortcut class={menuShortcutClass}>?</Menubar.Shortcut>
					</Menubar.Item>
				</Menubar.Content>
			</Menubar.Menu>
		</Menubar.Root>

		<UserAvatar name={user.name} />

		<Button
			variant="ghost"
			size="pill-icon"
			aria-label="Close"
			onclick={onClose}
			class="vela:h-6 vela:w-6"
		>
			×
		</Button>
	</div>
</div>

{#if seoOpen}
	{#await import('./seo-panel.svelte') then { default: SeoPanel }}
		<SeoPanel onClose={() => (seoOpen = false)} />
	{/await}
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

{#if cmsStore.openRelease}
	<PublishDialog
		open={publishOpen}
		onOpenChange={(next) => (publishOpen = next)}
		items={cmsStore.openRelease.items}
		{publishing}
		error={publishError}
		{user}
		{endpoint}
		onConfirm={onConfirmPublish}
	/>
{/if}

{#if newDialog}
	<NewPageDialog
		open={!!newDialog}
		onOpenChange={(next) => {
			if (!next) closeNewPageDialog();
		}}
		config={newDialog}
		creating={newPageCreating}
		error={newPageError}
		onCreate={handleCreate}
	/>
{/if}

<NewPageChooserDialog
	open={chooserOpen}
	onOpenChange={(next) => (chooserOpen = next)}
	{newPages}
	onSelect={onNewFromTemplate}
/>
</div>
