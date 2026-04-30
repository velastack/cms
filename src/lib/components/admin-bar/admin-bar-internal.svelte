<script lang="ts">
	import { afterNavigate, goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { pages } from 'virtual:vela-cms/pages';
	import { cmsStore } from '$lib/components/cms/cms-store.svelte.js';
	import type { CmsPayload, CmsScopeEntry } from '$lib/components/cms/scope.js';
	import './admin-bar.css';
	import HistoryPanel from './history-panel.svelte';
	import KeyboardShortcutsDialog from './keyboard-shortcuts-dialog.svelte';
	import NewPageChooserDialog from './new-page-chooser-dialog.svelte';
	import NewPageDialog from './new-page-dialog.svelte';
	import { isCreatable, type CmsCreatablePageConfigWithRouteId } from './page-config.js';
	import PagesPanel from './pages-panel.svelte';
	import PublishDialog from './publish-dialog.svelte';
	import { resolveRouteOnlyParams, resolveRouteUrl } from './resolve-route.js';
	import SharePreviewLinkDialog from './share-preview-link-dialog.svelte';
	import StatusPill from './status-pill.svelte';
	import { Button } from './ui/button/index.js';
	import { KbdShortcut } from './ui/kbd/index.js';
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
		'vela:flex vela:items-center vela:gap-2 vela:px-2 vela:py-1.5 vela:rounded-md vela:text-[13px] vela:cursor-pointer vela:outline-none vela:text-[var(--cms-status-error-text-base)] vela:focus:bg-[var(--cms-status-error-bg-hover)] vela:focus:text-[var(--cms-status-error-text-hover)] vela:data-disabled:opacity-40 vela:data-disabled:pointer-events-none';
	const menuLabelClass =
		'vela:px-2 vela:pt-2.5 vela:pb-1 vela:text-[10px] vela:font-semibold vela:uppercase vela:tracking-widest vela:text-bar-text-tertiary';
	const menuShortcutClass = 'vela:ml-auto';
	const menuSeparatorClass = 'vela:my-1 vela:h-px vela:bg-[var(--cms-bar-divider)]';
	const menuCheckIndicatorClass =
		'vela:flex vela:items-center vela:gap-2 vela:px-2 vela:py-1.5 vela:pl-7 vela:rounded-md vela:text-[13px] vela:cursor-pointer vela:outline-none vela:focus:bg-[var(--cms-bar-bg-hover)] vela:focus:text-bar-text vela:data-disabled:opacity-40';

	type ThemePref = 'system' | 'light' | 'dark';
	type Props = {
		user: { id: string; name: string };
		endpoint: string;
		onClose: () => void;
		themePref: ThemePref;
		setThemePref: (next: ThemePref) => void;
		resolvedTheme: 'light' | 'dark';
	};
	let { user, endpoint, onClose, themePref, setThemePref, resolvedTheme }: Props = $props();

	// Auto-discovered from `page.cms.ts` files via the Vite plugin's
	// `virtual:vela-cms/pages` module — consumers don't pass these.
	const creatablePages = $derived(Object.values(pages).filter(isCreatable));

	let seoOpen = $state(false);
	let historyOpen = $state(false);
	let pagesOpen = $state(false);
	let publishOpen = $state(false);
	let chooserOpen = $state(false);
	let shareLinkOpen = $state(false);
	let shortcutsOpen = $state(false);
	const anyPanelOpen = $derived(
		seoOpen ||
			historyOpen ||
			pagesOpen ||
			publishOpen ||
			chooserOpen ||
			shareLinkOpen ||
			shortcutsOpen
	);
	let publishing = $state(false);
	let publishError = $state<string | null>(null);

	let newDialog = $state<CmsCreatablePageConfigWithRouteId | null>(null);
	let newPageError = $state<string | null>(null);
	let newPageCreating = $state(false);
	// Source content captured when the dialog is opened in duplicate mode.
	// `metadata` seeds the input field values; `fields` is the rest of the
	// source's content (non-`_metadata` keys) that gets copied to the new page
	// after create succeeds.
	let duplicateSource = $state<{
		fields: Record<string, unknown>;
		metadata: Record<string, unknown>;
	} | null>(null);

	// Only one panel/dialog open at a time. Every "open X" routes through here.
	const closeAllPanels = () => {
		seoOpen = false;
		historyOpen = false;
		pagesOpen = false;
		publishOpen = false;
		chooserOpen = false;
		shareLinkOpen = false;
		shortcutsOpen = false;
		newDialog = null;
		newPageError = null;
		duplicateSource = null;
	};

	const counts = $derived(cmsStore.workingCopyCounts);
	const previewKey = $derived(cmsStore.openRelease?.preview_key ?? null);

	// Sub-bar (DESIGN.md §2) hangs below the main bar in edit/pending modes,
	// holding the contextual status pill + action buttons. Only the clean state
	// pill remains in the main bar.
	const subBarVisible = $derived(cmsStore.isEditing || counts.total > 0);

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
				credentials: 'include',
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				publishError = (await res.text()) || 'Could not publish release.';
				return;
			}
			cmsStore.setOpenRelease(null);
			publishOpen = false;
			await setPreviewParam(null, { replace: true });
			// Refetch `/docs` to pick up the just-published content as overlay.
			// `page.data.cms.docs` was loaded against the pre-publish published
			// state and we can't re-run server load on static-export sites; the
			// fresh overlay masks that staleness.
			await cmsStore.loadAndApplyOverlay(endpoint, currentScopes(), null, { reset: true });
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
		const res = await fetch(`${endpoint}/release/preview-key`, {
			method: 'POST',
			credentials: 'include'
		});
		if (!res.ok) return;
		await cmsStore.fetchOpenRelease(endpoint);
		await refreshAfterReleaseChange();
	};

	const onDiscardAllChanges = async () => {
		if (!confirm('Discard all unpublished changes in your working copy?')) return;
		const res = await fetch(`${endpoint}/release/discard`, {
			method: 'POST',
			credentials: 'include'
		});
		if (!res.ok) return;
		cmsStore.setOpenRelease(null);
		cmsStore.clearDrafts();
		await refreshAfterReleaseChange();
	};

	const onDiscardCurrentPage = async () => {
		if (currentPageItems.length === 0) return;
		if (!confirm('Discard unpublished changes on this page?')) return;
		for (const item of currentPageItems) {
			if (item.kind !== 'page') continue;
			await fetch(`${endpoint}/release/items`, {
				method: 'DELETE',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ kind: 'page', routeId: item.routeId, params: item.params })
			});
		}
		await cmsStore.fetchOpenRelease(endpoint);
		await refreshAfterReleaseChange();
		cmsStore.isEditing = false;
	};

	// "Publish this page…" and "Review & publish…" open the same modal; the
	// user filters down to the current page via the per-row checkboxes.
	const onPublishThisPage = onOpenPublish;

	const onNewFromTemplate = (config: CmsCreatablePageConfigWithRouteId) => {
		openNewPageDialog(config);
	};

	// "New page…" always opens the chooser.
	const onNewPage = () => {
		if (creatablePages.length === 0) return;
		closeAllPanels();
		chooserOpen = true;
	};

	const onHideBar = () => onClose();
	const onShareLink = () => {
		closeAllPanels();
		shareLinkOpen = true;
	};

	const onOpenSeo = () => {
		closeAllPanels();
		seoOpen = true;
	};

	// SEO edits are their own pending change — flush metadata drafts to the
	// working copy without entering or exiting page edit mode.
	const onSaveSeo = async () => {
		const result = await cmsStore.save(endpoint);
		if (!result.ok) return;
		seoOpen = false;
		const newKey = result.release?.preview_key ?? null;
		if (newKey) await setPreviewParam(newKey, { replace: true });
		await cmsStore.loadAndApplyOverlay(endpoint, currentScopes(), newKey);
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
		closeAllPanels();
		shortcutsOpen = true;
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
				} else if (k === 'p' || k === 'k') {
					e.preventDefault();
					if (pagesOpen) pagesOpen = false;
					else onOpenPages();
				} else if (k === 'h') {
					e.preventDefault();
					if (historyOpen) historyOpen = false;
					else onOpenHistory();
				} else if (k === 'i') {
					e.preventDefault();
					if (seoOpen) seoOpen = false;
					else onOpenSeo();
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
			} else if (e.key === '/') {
				e.preventDefault();
				if (pagesOpen) pagesOpen = false;
				else onOpenPages();
			} else if (e.key === '?') {
				e.preventDefault();
				onShowKeyboardShortcuts();
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	});

	const openNewPageDialog = (config: CmsCreatablePageConfigWithRouteId) => {
		closeAllPanels();
		newDialog = config;
		newPageError = null;
	};

	const onRequestDuplicate = async (
		config: CmsCreatablePageConfigWithRouteId,
		sourceParams: Record<string, string>
	) => {
		const qs = new URLSearchParams({
			kind: 'page',
			routeId: config.routeId,
			params: JSON.stringify(sourceParams)
		});
		const previewKey = cmsStore.openRelease?.preview_key;
		if (previewKey) qs.set('preview', previewKey);
		const res = await fetch(`${endpoint}/docs?${qs}`, { credentials: 'include' });
		const sourceContents: Record<string, unknown> = res.ok
			? ((await res.json()) as { contents: Record<string, unknown> }).contents
			: {};
		const { _metadata, ...rest } = sourceContents as { _metadata?: unknown } & Record<
			string,
			unknown
		>;
		const sourceMetadata =
			_metadata && typeof _metadata === 'object' && !Array.isArray(_metadata)
				? (_metadata as Record<string, unknown>)
				: {};
		closeAllPanels();
		duplicateSource = { fields: rest, metadata: sourceMetadata };
		newDialog = config;
		newPageError = null;
	};

	const closeNewPageDialog = () => {
		if (newPageCreating) return;
		newDialog = null;
		newPageError = null;
		duplicateSource = null;
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
			const { params: newParams, metadata: transformMeta = {} } = transformed;

			// Duplicating: keep the source's metadata and content as the base,
			// then let the transform's output (e.g. the new title) override on
			// matching keys. Without this merge a duplicated room would lose its
			// description, price, etc.
			const dup = duplicateSource;
			const metadata = dup ? { ...dup.metadata, ...transformMeta } : transformMeta;

			const createRes = await fetch(`${endpoint}/pages`, {
				method: 'POST',
				credentials: 'include',
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

			if (dup && Object.keys(dup.fields).length > 0) {
				await fetch(`${endpoint}/release/items`, {
					credentials: 'include',
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						items: [
							{
								kind: 'page',
								routeId: target.routeId,
								params: newParams,
								fields: dup.fields
							}
						]
					})
				});
			}

			await cmsStore.fetchOpenRelease(endpoint);
			const key = cmsStore.openRelease?.preview_key ?? null;
			const url = new URL(resolveRouteUrl(target.routeId, newParams), page.url.origin);
			if (key) url.searchParams.set('preview', key);
			newDialog = null;
			duplicateSource = null;
			pagesOpen = false;
			cmsStore.isEditing = true;
			await goto(url, { keepFocus: true, noScroll: true });
		} finally {
			newPageCreating = false;
		}
	};
</script>

<div
	class="vela-admin-bar"
	data-vela-theme={resolvedTheme}
	style:--cms-panel-top={subBarVisible && barPosition === 'top' ? '112px' : '72px'}
>
	<!-- Shadow ghost: same shape and position as the bar pill but at a lower
	     z-index than the sub-bar (9998) and panels (9998). The pill itself
	     carries no shadow, so the bar's drop shadow is occluded by anything
	     sitting underneath the bar instead of being painted over the top. -->
	<div
		aria-hidden="true"
		class="vela:fixed vela:left-1/2 vela:-translate-x-1/2 vela:z-[9997]
		vela:w-full vela:max-w-[560px] vela:mx-4 vela:sm:mx-auto
		vela:h-12 vela:rounded-full
		vela:shadow-[0_8px_24px_rgba(0,0,0,0.25)]
		{barPosition === 'bottom' ? 'vela:bottom-4' : 'vela:top-4'}"
	></div>

	<div
		class="vela:fixed vela:left-1/2 vela:-translate-x-1/2 vela:z-[9999]
		vela:flex vela:items-center vela:justify-between vela:gap-3
		vela:w-full vela:max-w-[560px] vela:mx-4 vela:sm:mx-auto
		vela:h-12 vela:px-3 vela:rounded-full
		vela:bg-bar-bg vela:text-bar-text
		{barPosition === 'bottom' ? 'vela:bottom-4' : 'vela:top-4'}"
	>
		<div class="vela:flex vela:items-center vela:gap-3">
			<span
				class="vela:text-[11px] vela:font-semibold vela:tracking-wider vela:uppercase
				vela:text-bar-text-tertiary"
			>
				CMS
			</span>

			{#if !subBarVisible}
				<StatusPill variant="clean">All published</StatusPill>
			{/if}
		</div>

		<div class="vela:flex vela:items-center vela:gap-2">
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
							<KbdShortcut keys="E" class={menuShortcutClass} />
						</Menubar.Item>
						<Menubar.Item class={menuItemClass} onSelect={onOpenSeo}>
							SEO &amp; Metadata
							<KbdShortcut keys="⌘I" class={menuShortcutClass} />
						</Menubar.Item>
						<Menubar.Separator class={menuSeparatorClass} />
						<Menubar.Item class={menuItemClass} onSelect={onCopyPreviewLink} disabled={!previewUrl}>
							Copy Preview Link
						</Menubar.Item>
						<Menubar.Item class={menuItemClass} onSelect={onOpenInNewTab}>
							Open In New Tab
							<KbdShortcut keys="⌘↵" class={menuShortcutClass} />
						</Menubar.Item>
						<Menubar.Separator class={menuSeparatorClass} />
						<Menubar.Item
							class={menuItemClass}
							onSelect={onDiscardCurrentPage}
							disabled={!hasCurrentPageDrafts}
						>
							Discard Draft…
						</Menubar.Item>
						<Menubar.Item
							class={menuItemClass}
							onSelect={onPublishThisPage}
							disabled={!hasCurrentPageDrafts}
						>
							Publish…
							<KbdShortcut keys="⌘⇧P" class={menuShortcutClass} />
						</Menubar.Item>
					</Menubar.Content>
				</Menubar.Menu>

				<Menubar.Menu>
					<Menubar.Trigger class={menubarTriggerClass}>Site</Menubar.Trigger>
					<Menubar.Content class={menuContentClassExt} align="end">
						<Menubar.Item
							class={menuItemClass}
							onSelect={onNewPage}
							disabled={creatablePages.length === 0}
						>
							New Page…
							<KbdShortcut keys="⌘N" class={menuShortcutClass} />
						</Menubar.Item>
						<Menubar.Item class={menuItemClass} onSelect={onOpenPages}>
							All Pages
							<KbdShortcut keys="⌘P" class={menuShortcutClass} />
						</Menubar.Item>
						<Menubar.Item class={menuItemClass} onSelect={onOpenPages}>
							Go To Page
							<KbdShortcut keys="⌘K" class={menuShortcutClass} />
						</Menubar.Item>

						<Menubar.Label class={menuLabelClass}>Working copy</Menubar.Label>
						<Menubar.Item
							class={menuItemClass}
							onSelect={onOpenPublish}
							disabled={counts.total === 0}
						>
							Review &amp; Publish…
							{#if counts.total > 0}
								<span class="vela:ml-auto vela:flex vela:items-center vela:gap-2">
									<span
										class="vela:inline-flex vela:items-center vela:justify-center
										vela:min-w-[18px] vela:h-[18px] vela:px-1 vela:rounded-full
										vela:text-[10px] vela:font-semibold
										vela:bg-[var(--cms-status-warn-bg)]
										vela:text-[var(--cms-status-warn-text)]">{counts.total}</span
									>
									<KbdShortcut keys="⌘⇧P" />
								</span>
							{:else}
								<KbdShortcut keys="⌘⇧P" class={menuShortcutClass} />
							{/if}
						</Menubar.Item>
						<Menubar.Item class={menuItemClass} onSelect={onShareLink} disabled={!previewUrl}>
							Share Preview Link…
						</Menubar.Item>
						<Menubar.Item
							class={menuItemDestructiveClass}
							onSelect={onDiscardAllChanges}
							disabled={counts.total === 0}
						>
							Discard All Changes…
						</Menubar.Item>

						<Menubar.Label class={menuLabelClass}>History</Menubar.Label>
						<Menubar.Item class={menuItemClass} onSelect={onOpenHistory}>
							Recent Releases
							<KbdShortcut keys="⌘H" class={menuShortcutClass} />
						</Menubar.Item>
					</Menubar.Content>
				</Menubar.Menu>

				<Menubar.Menu>
					<Menubar.Trigger class={menubarTriggerClass}>View</Menubar.Trigger>
					<Menubar.Content class={menuContentClassExt} align="end">
						<Menubar.Label class={menuLabelClass}>Bar</Menubar.Label>
						<Menubar.Item class={menuItemClass} onSelect={onHideBar}>
							Hide Bar
							<KbdShortcut keys="⌘." class={menuShortcutClass} />
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
						<Menubar.CheckboxItem class={menuCheckIndicatorClass} bind:checked={highlightSlots}>
							Highlight Editable Areas
							<KbdShortcut keys="⌘⇧E" class={menuShortcutClass} />
						</Menubar.CheckboxItem>
						<Menubar.CheckboxItem class={menuCheckIndicatorClass} bind:checked={showDraftMarkers}>
							Show Draft Markers On Links
						</Menubar.CheckboxItem>

						<Menubar.Label class={menuLabelClass}>Preview As</Menubar.Label>
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
								<Menubar.Item
									class={menuCheckIndicatorClass}
									onSelect={() => setThemePref('system')}
								>
									<span class="vela:absolute vela:left-2">
										{themePref === 'system' ? '✓' : ''}
									</span>
									System
								</Menubar.Item>
								<Menubar.Item
									class={menuCheckIndicatorClass}
									onSelect={() => setThemePref('light')}
								>
									<span class="vela:absolute vela:left-2">
										{themePref === 'light' ? '✓' : ''}
									</span>
									Light
								</Menubar.Item>
								<Menubar.Item class={menuCheckIndicatorClass} onSelect={() => setThemePref('dark')}>
									<span class="vela:absolute vela:left-2">
										{themePref === 'dark' ? '✓' : ''}
									</span>
									Dark
								</Menubar.Item>
							</Menubar.SubContent>
						</Menubar.Sub>

						<Menubar.Separator class={menuSeparatorClass} />
						<Menubar.Item class={menuItemClass} onSelect={onShowKeyboardShortcuts}>
							Keyboard Shortcuts…
							<KbdShortcut keys="?" class={menuShortcutClass} />
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

	{#if subBarVisible}
		<!-- Sub-bar: bg starts behind the main bar (same top, taller height) so it
		     reads as a footer/extension. Top corners are square; bottom matches
		     the main bar's pill curvature. Bg is mostly transparent so the page
		     shows through. The visible band is the 40px below the main bar. -->
		<div
			class="vela:fixed vela:left-1/2 vela:-translate-x-1/2 vela:z-[9998]
			vela:flex vela:justify-between vela:gap-3
			vela:w-full vela:max-w-[560px] vela:mx-4 vela:sm:mx-auto
			vela:h-16 vela:px-3
			vela:text-bar-text
			vela:bg-[var(--cms-sub-bar-bg)]
			vela:border vela:border-[var(--cms-sub-bar-border)]
			{barPosition === 'bottom'
				? 'vela:bottom-10 vela:pt-2 vela:items-start vela:rounded-t-3xl'
				: 'vela:top-10 vela:pb-2 vela:items-end vela:rounded-b-3xl'}"
		>
			<div class="vela:flex vela:items-center">
				{#if cmsStore.isEditing}
					<StatusPill
						variant="edit"
						class="vela:h-5.5 vela:pl-2 vela:pr-2.5 vela:gap-1 vela:text-[11px]"
					>
						Editing
					</StatusPill>
				{:else}
					<StatusPill
						variant="warn"
						onclick={onOpenPages}
						class="vela:h-5.5 vela:pl-2 vela:pr-2.5 vela:gap-1 vela:text-[11px]"
					>
						{counts.total}
						{counts.total === 1 ? 'page draft' : 'pages draft'}
					</StatusPill>
				{/if}
			</div>

			<div class="vela:flex vela:items-center vela:gap-1.5">
				{#if cmsStore.isEditing}
					<Button
						variant="ghost"
						size="pill"
						onclick={onToggleEdit}
						class="vela:h-5.5 vela:px-2.5 vela:text-[10px]"
					>
						Cancel
					</Button>
					<Button size="pill" onclick={onSave} class="vela:h-5.5 vela:px-2.5 vela:text-[10px]">
						Save
					</Button>
				{:else}
					<Button
						variant="ghost"
						size="pill"
						onclick={onDiscardAllChanges}
						class="vela:h-5.5 vela:px-2.5 vela:text-[10px]"
					>
						Discard all changes…
					</Button>
					<Button
						size="pill"
						onclick={onOpenPublish}
						class="vela:h-5.5 vela:px-2.5 vela:text-[10px]"
					>
						Publish…
					</Button>
				{/if}
			</div>
		</div>
	{/if}

	{#if seoOpen}
		{#await import('./seo-panel.svelte') then { default: SeoPanel }}
			<SeoPanel onClose={() => (seoOpen = false)} onSave={onSaveSeo} />
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
			{creatablePages}
			onClose={() => (pagesOpen = false)}
			onChanged={refreshAfterReleaseChange}
			onRequestNew={openNewPageDialog}
			{onRequestDuplicate}
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
			mode={duplicateSource ? 'duplicate' : 'new'}
			initialValues={duplicateSource
				? Object.fromEntries(
						Object.entries(duplicateSource.metadata).filter(([, v]) => typeof v === 'string') as [
							string,
							string
						][]
					)
				: {}}
		/>
	{/if}

	<NewPageChooserDialog
		open={chooserOpen}
		onOpenChange={(next) => (chooserOpen = next)}
		{creatablePages}
		onSelect={onNewFromTemplate}
	/>

	<SharePreviewLinkDialog
		open={shareLinkOpen}
		onOpenChange={(next) => (shareLinkOpen = next)}
		{previewUrl}
		onRegenerate={onRegeneratePreviewKey}
	/>

	<KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={(next) => (shortcutsOpen = next)} />
</div>
