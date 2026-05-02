<script lang="ts">
	import {
		afterNavigate,
		beforeNavigate,
		goto,
		invalidateAll,
		replaceState
	} from '$app/navigation';
	import { page } from '$app/state';
	import { pages } from 'virtual:vela-cms/pages';
	import { cmsStore, type PageDeleteOutcome } from '$lib/components/cms/cms-store.svelte.js';
	import type { CmsPayload, CmsScopeEntry } from '$lib/components/cms/scope.js';
	import CssRoot from './css-root.svelte';
	import { adminBarTheme, type AdminBarTheme } from './theme.svelte.js';
	import DeletePageDialog, {
		type DeletePageMode,
		type RedirectTarget
	} from './delete-page-dialog.svelte';
	import HistoryPanel from './history-panel.svelte';
	import KeyboardShortcutsDialog from './keyboard-shortcuts-dialog.svelte';
	import MediaPanel from './media-panel.svelte';
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
	const avatarTriggerClass =
		'vela:bg-transparent vela:border-0 vela:p-0 vela:rounded-full vela:cursor-pointer vela:focus:outline-none vela:aria-expanded:ring-2 vela:aria-expanded:ring-[var(--cms-accent)] vela:aria-expanded:ring-offset-2 vela:aria-expanded:ring-offset-[var(--cms-bar-bg)]';

	type Props = {
		user: { id: string; name: string };
		endpoint: string;
		onClose: () => void;
		onLogout: () => void;
	};
	let { user, endpoint, onClose, onLogout }: Props = $props();

	const setThemePref = (next: AdminBarTheme) => adminBarTheme.setPref(next);

	// Auto-discovered from `page.cms.ts` files via the Vite plugin's
	// `virtual:vela-cms/pages` module — consumers don't pass these.
	const creatablePages = $derived(Object.values(pages).filter(isCreatable));

	let seoOpen = $state(false);
	let historyOpen = $state(false);
	let pagesOpen = $state(false);
	let mediaOpen = $state(false);
	let localesOpen = $state(false);
	let publishOpen = $state(false);
	let chooserOpen = $state(false);
	let shareLinkOpen = $state(false);
	let shortcutsOpen = $state(false);
	const anyPanelOpen = $derived(
		seoOpen ||
			historyOpen ||
			pagesOpen ||
			mediaOpen ||
			localesOpen ||
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

	// Delete-page dialog. Shared between the in-panel "Delete" button and the
	// `Page → Delete Page…` menu entry; pages-panel calls `requestDelete` via
	// its `onRequestDelete` prop, the menu calls it directly.
	type WirePageEntry = {
		params: Record<string, string>;
		isDraft?: boolean;
		isDeletePending?: boolean;
		redirectTo?: string;
		gone?: boolean;
		metadata?: Record<string, unknown>;
	};
	type WirePageRoute = { routeId: string; entries: WirePageEntry[] };
	let deleteDialogOpen = $state(false);
	let deleteTarget = $state<{
		routeId: string;
		params: Record<string, string>;
		url: string;
		isDraft: boolean;
	} | null>(null);
	let deleteRoutes = $state<WirePageRoute[]>([]);
	let deleteError = $state<string | null>(null);
	let deleting = $state(false);
	// Source content captured when the dialog is opened in duplicate mode.
	// `metadata` seeds the input field values; `tree` is the rest of the
	// source's content (non-`metadata` branch) that gets copied to the new
	// page after create succeeds.
	let duplicateSource = $state<{
		tree: Record<string, unknown>;
		metadata: Record<string, unknown>;
	} | null>(null);

	// Only one panel/dialog open at a time. Every "open X" routes through here.
	const closeAllPanels = () => {
		seoOpen = false;
		historyOpen = false;
		pagesOpen = false;
		mediaOpen = false;
		localesOpen = false;
		publishOpen = false;
		chooserOpen = false;
		shareLinkOpen = false;
		shortcutsOpen = false;
		newDialog = null;
		newPageError = null;
		duplicateSource = null;
		if (!deleting) {
			deleteDialogOpen = false;
			deleteTarget = null;
			deleteError = null;
		}
	};

	const counts = $derived(cmsStore.workingCopyCounts);
	const previewKey = $derived(cmsStore.openRelease?.preview_key ?? null);

	// `?version=<key>` opens a past published release in read-only snapshot
	// view. Mutually exclusive with the draft `?preview=` flow: when set, we
	// suppress draft overlays/auto-add and disable edit-mode entry.
	const versionKey = $derived(page.url.searchParams.get('version'));
	let versionRelease = $state<{ id: string; preview_key: string; name?: string } | null>(null);

	// `cms.locale` is what the consumer's `getLocale(url)` returned this request,
	// resolved server-side by `loadCms`. The admin bar uses it for overlay-fetch
	// keying and to drive the Locales panel's "current preview locale" indicator.
	// Switching locale goes through `setLocaleParam` → SvelteKit nav → server
	// reload → new `cms.locale`.
	const currentLocale = $derived((page.data.cms as CmsPayload | undefined)?.locale ?? '');
	const supportedLocales = $derived(
		(page.data.cms as CmsPayload | undefined)?.locales ?? []
	);

	// Sub-bar (DESIGN.md §2) hangs below the main bar in edit/pending modes,
	// holding the contextual status pill + action buttons. Only the clean state
	// pill remains in the main bar.
	const subBarVisible = $derived(cmsStore.isEditing || counts.total > 0 || !!versionKey);

	const previewUrl = $derived.by(() => {
		if (versionKey) {
			const url = new URL(page.url);
			url.searchParams.delete('edit');
			url.searchParams.delete('preview');
			url.searchParams.set('version', versionKey);
			return url.toString();
		}
		const key = previewKey;
		if (!key) return '';
		const url = new URL(page.url);
		url.searchParams.delete('edit');
		url.searchParams.set('preview', key);
		return url.toString();
	});

	const currentScopes = (): CmsScopeEntry[] => {
		const cms = page.data.cms as CmsPayload | undefined;
		return cms ? Object.values(cms.scopes) : [];
	};

	const currentEntriesRouteIds = (): string[] => {
		const cms = page.data.cms as CmsPayload | undefined;
		return cms ? Object.keys(cms.entries ?? {}) : [];
	};

	const setPreviewParam = async (key: string | null, opts: { replace?: boolean } = {}) => {
		const url = new URL(page.url);
		const current = url.searchParams.get('preview');
		url.searchParams.delete('edit');
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

	const setVersionParam = async (key: string | null, opts: { replace?: boolean } = {}) => {
		const url = new URL(page.url);
		const current = url.searchParams.get('version');
		url.searchParams.delete('edit');
		url.searchParams.delete('preview');
		if (key) {
			if (current === key) return;
			url.searchParams.set('version', key);
		} else {
			if (!current) return;
			url.searchParams.delete('version');
		}
		const path = url.pathname + url.search + url.hash;
		if (opts.replace) {
			replaceState(path, page.state);
		} else {
			await goto(path, { keepFocus: true, noScroll: true });
			// Force the server load to re-fetch. SvelteKit's URL tracking
			// doesn't always pick up our `?version=` access (it lives behind
			// the `loadCms` helper) — visible on Exit, where we'd otherwise
			// keep showing the past release's `page.data.cms.docs`.
			await invalidateAll();
		}
	};

	// Override the consumer's pathname-derived locale for the editor preview.
	// The lib doesn't read `?locale=` itself; the consumer's `getLocale(url)` is
	// expected to honor it (typical pattern: `?locale=` wins over pathname).
	// Setting it triggers a SvelteKit nav, which re-runs `loadCms` with the new
	// locale and refreshes `page.data.cms`. Like the other gating params, we
	// strip the param when `null`.
	const setLocaleParam = async (locale: string | null, opts: { replace?: boolean } = {}) => {
		const url = new URL(page.url);
		const current = url.searchParams.get('locale');
		if (locale) {
			if (current === locale) return;
			url.searchParams.set('locale', locale);
		} else {
			if (!current) return;
			url.searchParams.delete('locale');
		}
		const path = url.pathname + url.search + url.hash;
		if (opts.replace) {
			replaceState(path, page.state);
		} else {
			await goto(path, { keepFocus: true, noScroll: true });
			await invalidateAll();
		}
	};

	// Set true while exitVersionView is mid-flight so beforeNavigate doesn't
	// re-inject `?version=` and undo the exit.
	let exitingVersion = false;

	const exitVersionView = async () => {
		exitingVersion = true;
		try {
			await setVersionParam(null);
		} finally {
			exitingVersion = false;
		}
	};

	// Resolve the `?version=` URL param to its `PublishedRelease` (so we know
	// the id for regenerate). Re-fetched whenever the version key changes.
	const fetchVersionRelease = async (key: string) => {
		const res = await fetch(`${endpoint}/release/history`, { credentials: 'include' });
		if (!res.ok) {
			versionRelease = null;
			return;
		}
		const data = (await res.json()) as {
			history: Array<{ id: string; preview_key: string; name?: string }>;
		};
		const match = data.history.find((r) => r.preview_key === key) ?? null;
		versionRelease = match
			? { id: match.id, preview_key: match.preview_key, name: match.name }
			: null;
	};

	// On mount: hydrate the open release, then sync the URL's `?preview=` to
	// the release's preview key (or strip it). Apply a fresh client-side
	// overlay by fetching `${endpoint}/docs` for each current-route scope —
	// this is what makes the editor experience work on static-export sites
	// where SvelteKit's server load can't be re-run. With no release, leave
	// the overlay empty: `page.data.cms.docs` is the published source.
	//
	// `?version=` shortcuts the draft sync: we don't auto-add `?preview=`,
	// don't strip `?version=`, and load the past-release snapshot via
	// `versionKey` so editors can preview a past release alongside their bar.
	$effect(() => {
		void (async () => {
			await cmsStore.fetchOpenRelease(endpoint);

			if (versionKey) {
				await fetchVersionRelease(versionKey);
				await Promise.all([
					cmsStore.loadAndApplyOverlay(endpoint, currentScopes(), null, {
						reset: true,
						versionKey,
						locale: currentLocale
					}),
					cmsStore.loadAndApplyEntriesOverlay(endpoint, currentEntriesRouteIds(), null, {
						reset: true,
						versionKey,
						locale: currentLocale
					})
				]);
				return;
			}

			versionRelease = null;
			const key = cmsStore.openRelease?.preview_key ?? null;
			const current = page.url.searchParams.get('preview');
			if (key && current !== key) {
				await setPreviewParam(key, { replace: true });
			} else if (!key && current) {
				await setPreviewParam(null, { replace: true });
			}
			if (key) {
				await Promise.all([
					cmsStore.loadAndApplyOverlay(endpoint, currentScopes(), key, {
						reset: true,
						locale: currentLocale
					}),
					cmsStore.loadAndApplyEntriesOverlay(endpoint, currentEntriesRouteIds(), key, {
						reset: true,
						locale: currentLocale
					})
				]);
			} else {
				cmsStore.clearOverlay();
			}
		})();
	});

	// Carry the active gating params (`?version=` if in version-view, else
	// `?preview=`, plus `?locale=` if set) into every internal navigation so
	// the overlay and preview-locale survive link clicks (and any `goto()` in
	// app code). We cancel the in-flight nav and re-issue with the params
	// appended; already-correct nav targets pass through unchanged. Full-page
	// unloads (`willUnload`) and external/hash-only navs bypass.
	beforeNavigate((nav) => {
		if (nav.type === 'leave' || nav.willUnload) return;
		if (!nav.to) return;
		if (nav.to.url.origin !== location.origin) return;

		const localeParam = page.url.searchParams.get('locale');
		const localeNeedsCarry = (target: URL) =>
			!!localeParam && target.searchParams.get('locale') !== localeParam;
		const carryLocaleOnto = (url: URL) => {
			if (localeParam) url.searchParams.set('locale', localeParam);
		};

		if (versionKey) {
			const targetVersion = nav.to.url.searchParams.get('version');
			// Target carries its own `?version=` (same or different — e.g. clicking
			// View on another release): respect it, don't clobber. Locale still
			// rides along if missing on target.
			if (targetVersion) {
				if (!localeNeedsCarry(nav.to.url)) return;
				nav.cancel();
				const url = new URL(nav.to.url);
				carryLocaleOnto(url);
				void goto(url.pathname + url.search + url.hash, {
					keepFocus: true,
					noScroll: true
				});
				return;
			}
			// Target has no `?version=`. If we're exiting on purpose, let the nav
			// proceed; otherwise it's a normal link click and we carry version over.
			if (exitingVersion) return;
			nav.cancel();
			const url = new URL(nav.to.url);
			url.searchParams.delete('preview');
			url.searchParams.set('version', versionKey);
			carryLocaleOnto(url);
			void goto(url.pathname + url.search + url.hash, {
				keepFocus: true,
				noScroll: true
			});
			return;
		}

		// Target is jumping to a `?version=` URL (e.g. View button from history
		// panel) — let it through unmodified except for locale carry.
		if (nav.to.url.searchParams.get('version')) {
			if (!localeNeedsCarry(nav.to.url)) return;
			nav.cancel();
			const url = new URL(nav.to.url);
			carryLocaleOnto(url);
			void goto(url.pathname + url.search + url.hash, {
				keepFocus: true,
				noScroll: true
			});
			return;
		}

		const key = cmsStore.openRelease?.preview_key ?? null;
		const previewMatches = !key || nav.to.url.searchParams.get('preview') === key;
		if (previewMatches && !localeNeedsCarry(nav.to.url)) return;

		nav.cancel();
		const url = new URL(nav.to.url);
		if (key) url.searchParams.set('preview', key);
		carryLocaleOnto(url);
		void goto(url.pathname + url.search + url.hash, {
			keepFocus: true,
			noScroll: true
		});
	});

	// Re-apply the overlay on every internal navigation. SvelteKit may strip
	// the gating param when nav targets aren't preserve-params links, so we
	// reapply it via replaceState too. Merge (not reset) so unchanged-layout
	// overlays keep showing while new-page-scope fetches resolve.
	afterNavigate(() => {
		if (versionKey) {
			const url = new URL(page.url);
			if (url.searchParams.get('version') !== versionKey) {
				url.searchParams.delete('preview');
				url.searchParams.set('version', versionKey);
				replaceState(url.pathname + url.search + url.hash, page.state);
			}
			// `reset` so a nav from one release to another wipes the prior
			// snapshot's overlay before merging in the new one — otherwise
			// stale fields from the previous release leak through on scopes
			// the new release doesn't touch.
			void cmsStore.loadAndApplyOverlay(endpoint, currentScopes(), null, {
				reset: true,
				versionKey,
				locale: currentLocale
			});
			void cmsStore.loadAndApplyEntriesOverlay(endpoint, currentEntriesRouteIds(), null, {
				reset: true,
				versionKey,
				locale: currentLocale
			});
			return;
		}

		const key = cmsStore.openRelease?.preview_key ?? null;
		if (!key) {
			// No draft and no version → clear any overlay left over from a
			// previous version-mode visit. Without this, exiting version view
			// leaves the past release's content stuck on top of the freshly
			// re-fetched `page.data.cms.docs`.
			cmsStore.clearOverlay();
			return;
		}
		const url = new URL(page.url);
		if (url.searchParams.get('preview') !== key) {
			url.searchParams.set('preview', key);
			replaceState(url.pathname + url.search + url.hash, page.state);
		}
		void cmsStore.loadAndApplyOverlay(endpoint, currentScopes(), key, { locale: currentLocale });
		void cmsStore.loadAndApplyEntriesOverlay(endpoint, currentEntriesRouteIds(), key, {
			locale: currentLocale
		});
	});

	const onSave = async () => {
		const result = await cmsStore.save(endpoint);
		if (!result.ok) return;
		cmsStore.isEditing = false;
		seoOpen = false;
		const newKey = result.release?.preview_key ?? null;
		if (newKey) await setPreviewParam(newKey, { replace: true });
		await Promise.all([
			cmsStore.loadAndApplyOverlay(endpoint, currentScopes(), newKey, {
				locale: currentLocale
			}),
			cmsStore.loadAndApplyEntriesOverlay(endpoint, currentEntriesRouteIds(), newKey, {
				locale: currentLocale
			})
		]);
	};

	const onToggleEdit = () => {
		// Past releases are read-only — no edit, no save, no publish flow.
		if (versionKey) return;
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

	const onOpenMedia = () => {
		closeAllPanels();
		mediaOpen = true;
	};

	const onOpenLocales = () => {
		closeAllPanels();
		localesOpen = true;
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
			// Refetch `/docs` and `/pages` to pick up the just-published content
			// as overlay. `page.data.cms.{docs,entries}` was loaded against the
			// pre-publish published state and we can't re-run server load on
			// static-export sites; the fresh overlays mask that staleness.
			await Promise.all([
				cmsStore.loadAndApplyOverlay(endpoint, currentScopes(), null, {
					reset: true,
					locale: currentLocale
				}),
				cmsStore.loadAndApplyEntriesOverlay(endpoint, currentEntriesRouteIds(), null, {
					reset: true,
					locale: currentLocale
				})
			]);
		} finally {
			publishing = false;
		}
	};

	const refreshAfterReleaseChange = async () => {
		const key = cmsStore.openRelease?.preview_key ?? null;
		await setPreviewParam(key, { replace: true });
		await Promise.all([
			cmsStore.loadAndApplyOverlay(endpoint, currentScopes(), key, {
				reset: true,
				locale: currentLocale
			}),
			cmsStore.loadAndApplyEntriesOverlay(endpoint, currentEntriesRouteIds(), key, {
				reset: true,
				locale: currentLocale
			})
		]);
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

	/**
	 * Current page identity + creatable config when it has owned params (i.e.
	 * is a parameterized template instance). Drives the `Page → Delete Page…`
	 * menu's enable state — static pages and unconfigured routes can't be
	 * deleted from the data layer alone.
	 */
	const currentDeletableConfig = $derived.by((): CmsCreatablePageConfigWithRouteId | null => {
		const cms = page.data.cms as CmsPayload | undefined;
		const pp = cms?.page;
		if (!pp) return null;
		if (Object.keys(pp.params).length === 0) return null;
		const config = pages[pp.routeId];
		if (!config) return null;
		return isCreatable(config) ? config : null;
	});

	const paramsEqual = (
		a: Record<string, string>,
		b: Record<string, string>
	): boolean => {
		const aKeys = Object.keys(a);
		if (aKeys.length !== Object.keys(b).length) return false;
		for (const k of aKeys) if (a[k] !== b[k]) return false;
		return true;
	};

	const isCurrentPage = (routeId: string, params: Record<string, string>): boolean => {
		const cms = page.data.cms as CmsPayload | undefined;
		const pp = cms?.page;
		return !!pp && pp.routeId === routeId && paramsEqual(pp.params, params);
	};

	/**
	 * Selectable redirect targets for the delete dialog — every published,
	 * non-tombstoned, non-draft entry across all routes. Sourced from the
	 * cached `/pages` snapshot fetched by `requestDelete`.
	 */
	const redirectTargets = $derived.by((): RedirectTarget[] => {
		const out: RedirectTarget[] = [];
		for (const r of deleteRoutes) {
			for (const e of r.entries) {
				if (e.isDraft || e.isDeletePending || e.redirectTo || e.gone) continue;
				let url: string;
				try {
					url = resolveRouteUrl(r.routeId, e.params);
				} catch {
					continue;
				}
				out.push({ url, routeId: r.routeId, params: e.params });
			}
		}
		out.sort((a, b) => a.url.localeCompare(b.url));
		return out;
	});

	/**
	 * Map of source-url → terminal-redirect-url across published tombstones
	 * plus the working release. Lets the dialog auto-flatten `A → B → C` to
	 * `A → C` at submit time so we don't write redirect chains.
	 */
	const redirectsByUrl = $derived.by((): Record<string, string> => {
		const out: Record<string, string> = {};
		for (const r of deleteRoutes) {
			for (const e of r.entries) {
				if (!e.redirectTo) continue;
				try {
					out[resolveRouteUrl(r.routeId, e.params)] = e.redirectTo;
				} catch {
					/* skip */
				}
			}
		}
		for (const item of cmsStore.openRelease?.items ?? []) {
			if (item.kind !== 'page-delete') continue;
			if (item.outcome?.kind !== 'redirect') continue;
			try {
				out[resolveRouteUrl(item.routeId, item.params)] = item.outcome.to;
			} catch {
				/* skip */
			}
		}
		return out;
	});

	/**
	 * Open the delete dialog targeting `(routeId, params)`. Both the
	 * `pages-panel` row button and the `Page → Delete Page…` menu route
	 * through here. Re-fetches `/pages` so target/chain data and the entry's
	 * draft flag are fresh.
	 */
	const requestDelete = async (
		routeId: string,
		params: Record<string, string>,
		isDraftHint = false
	) => {
		let url: string;
		try {
			url = resolveRouteUrl(routeId, params);
		} catch {
			return;
		}

		let isDraft = isDraftHint;
		try {
			const res = await fetch(`${endpoint}/pages`, { credentials: 'include' });
			if (res.ok) {
				const data = (await res.json()) as { routes: WirePageRoute[] };
				deleteRoutes = data.routes;
				const route = data.routes.find((r) => r.routeId === routeId);
				const entry = route?.entries.find((e) => paramsEqual(e.params, params));
				if (entry) isDraft = entry.isDraft ?? false;
			}
		} catch {
			/* keep stale `deleteRoutes` and the caller's hint */
		}

		deleteTarget = { routeId, params, url, isDraft };
		deleteError = null;
		deleteDialogOpen = true;
	};

	const onDeletePage = () => {
		const cms = page.data.cms as CmsPayload | undefined;
		const pp = cms?.page;
		if (!pp || !currentDeletableConfig) return;
		closeAllPanels();
		void requestDelete(pp.routeId, pp.params);
	};

	const onDeleteConfirm = async (mode: DeletePageMode, target?: string) => {
		if (!deleteTarget) return;
		const { routeId, params, isDraft } = deleteTarget;
		const onCurrent = isCurrentPage(routeId, params);
		deleting = true;
		deleteError = null;
		try {
			let outcome: PageDeleteOutcome | undefined;
			if (mode === 'gone') outcome = { kind: 'gone' };
			else if (mode === 'redirect' && target) outcome = { kind: 'redirect', to: target };
			const body: Record<string, unknown> = { routeId, params };
			// Drafts always hard-discard regardless of mode — the dialog gates
			// gone/redirect off when isDraft, but defend in depth.
			if (!isDraft && outcome) body.outcome = outcome;
			const res = await fetch(`${endpoint}/pages`, {
				method: 'DELETE',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				deleteError = 'Could not delete page.';
				return;
			}
			deleteDialogOpen = false;
			deleteTarget = null;
			await cmsStore.fetchOpenRelease(endpoint);
			if (!onCurrent) await refreshAfterReleaseChange();
		} finally {
			deleting = false;
		}
	};

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
		if (versionKey && versionRelease) {
			const res = await fetch(
				`${endpoint}/release/history/${versionRelease.id}/preview-key`,
				{ method: 'POST', credentials: 'include' }
			);
			if (!res.ok) return;
			const data = (await res.json()) as { preview_key: string };
			versionRelease = { ...versionRelease, preview_key: data.preview_key };
			await setVersionParam(data.preview_key, { replace: true });
			await Promise.all([
				cmsStore.loadAndApplyOverlay(endpoint, currentScopes(), null, {
					reset: true,
					versionKey: data.preview_key,
					locale: currentLocale
				}),
				cmsStore.loadAndApplyEntriesOverlay(endpoint, currentEntriesRouteIds(), null, {
					reset: true,
					versionKey: data.preview_key,
					locale: currentLocale
				})
			]);
			return;
		}

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
		await Promise.all([
			cmsStore.loadAndApplyOverlay(endpoint, currentScopes(), newKey, {
				locale: currentLocale
			}),
			cmsStore.loadAndApplyEntriesOverlay(endpoint, currentEntriesRouteIds(), newKey, {
				locale: currentLocale
			})
		]);
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
			const editable = isEditableTarget(e.target);

			if (meta) {
				const k = e.key.toLowerCase();
				if (k === 's' && cmsStore.isEditing) {
					e.preventDefault();
					void onSave();
				} else if (k === 'e') {
					e.preventDefault();
					onToggleEdit();
				} else if (k === 'p') {
					e.preventDefault();
					onOpenPublish();
				} else if (k === 'k') {
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
		const { metadata: meta, ...rest } = sourceContents as { metadata?: unknown } & Record<
			string,
			unknown
		>;
		const sourceMetadata =
			meta && typeof meta === 'object' && !Array.isArray(meta)
				? (meta as Record<string, unknown>)
				: {};
		closeAllPanels();
		duplicateSource = { tree: rest, metadata: sourceMetadata };
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

			if (dup && Object.keys(dup.tree).length > 0) {
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
								tree: dup.tree
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

<CssRoot>
	<div style:--cms-panel-top={subBarVisible && barPosition === 'top' ? '112px' : '72px'}>
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
								disabled={cmsStore.isEditing || !!versionKey}
							>
								Edit
								<KbdShortcut keys="⌘E" class={menuShortcutClass} />
							</Menubar.Item>
							<Menubar.Item class={menuItemClass} onSelect={onOpenSeo}>
								SEO &amp; Metadata
								<KbdShortcut keys="⌘I" class={menuShortcutClass} />
							</Menubar.Item>
							<Menubar.Separator class={menuSeparatorClass} />
							<Menubar.Item
								class={menuItemClass}
								onSelect={onCopyPreviewLink}
								disabled={!previewUrl}
							>
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
								<KbdShortcut keys="⌘P" class={menuShortcutClass} />
							</Menubar.Item>
							<Menubar.Separator class={menuSeparatorClass} />
							<Menubar.Item
								class={menuItemDestructiveClass}
								onSelect={onDeletePage}
								disabled={!currentDeletableConfig}
							>
								Delete Page…
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
								<KbdShortcut keys="⌘K" class={menuShortcutClass} />
							</Menubar.Item>
							<Menubar.Item class={menuItemClass} onSelect={onOpenMedia}>
								Media Library
							</Menubar.Item>
							{#if supportedLocales.length > 1}
								<Menubar.Item class={menuItemClass} onSelect={onOpenLocales}>
									Locales
								</Menubar.Item>
							{/if}

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
										<KbdShortcut keys="⌘P" />
									</span>
								{:else}
									<KbdShortcut keys="⌘P" class={menuShortcutClass} />
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
											{adminBarTheme.pref === 'system' ? '✓' : ''}
										</span>
										System
									</Menubar.Item>
									<Menubar.Item
										class={menuCheckIndicatorClass}
										onSelect={() => setThemePref('light')}
									>
										<span class="vela:absolute vela:left-2">
											{adminBarTheme.pref === 'light' ? '✓' : ''}
										</span>
										Light
									</Menubar.Item>
									<Menubar.Item
										class={menuCheckIndicatorClass}
										onSelect={() => setThemePref('dark')}
									>
										<span class="vela:absolute vela:left-2">
											{adminBarTheme.pref === 'dark' ? '✓' : ''}
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

					<Menubar.Menu>
						<Menubar.Trigger class={avatarTriggerClass} aria-label="Account menu">
							<UserAvatar name={user.name} />
						</Menubar.Trigger>
						<Menubar.Content class={menuContentClassExt} align="end">
							<Menubar.Item class={menuItemClass} onSelect={onLogout}
								>Log Out {user.name}</Menubar.Item
							>
						</Menubar.Content>
					</Menubar.Menu>
				</Menubar.Root>

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
					{#if versionKey}
						<StatusPill
							variant="edit"
							class="vela:h-5.5 vela:pl-2 vela:pr-2.5 vela:gap-1 vela:text-[11px]"
						>
							Viewing release {versionRelease?.name ?? versionRelease?.id.slice(0, 8) ?? ''}
						</StatusPill>
					{:else if cmsStore.isEditing}
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
					{#if versionKey}
						<Button
							size="pill"
							onclick={exitVersionView}
							class="vela:h-5.5 vela:px-2.5 vela:text-[10px]"
						>
							Exit
						</Button>
					{:else if cmsStore.isEditing}
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
				onRequestDelete={(routeId, params, isDraft) =>
					void requestDelete(routeId, params, isDraft)}
			/>
		{/if}

		{#if mediaOpen}
			<MediaPanel {endpoint} onClose={() => (mediaOpen = false)} />
		{/if}

		{#if localesOpen}
			{#await import('./locales-panel.svelte') then { default: LocalesPanel }}
				<LocalesPanel
					currentLocale={currentLocale}
					locales={supportedLocales}
					onClose={() => (localesOpen = false)}
					onSelectLocale={(locale) => {
						const target = locale === supportedLocales[0] ? null : locale;
						void setLocaleParam(target);
					}}
				/>
			{/await}
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

		<DeletePageDialog
			open={deleteDialogOpen}
			onOpenChange={(next) => {
				if (!next && deleting) return;
				deleteDialogOpen = next;
				if (!next) deleteTarget = null;
			}}
			url={deleteTarget?.url ?? ''}
			isDraft={deleteTarget?.isDraft ?? false}
			targets={redirectTargets}
			{redirectsByUrl}
			{deleting}
			error={deleteError}
			onConfirm={onDeleteConfirm}
		/>

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
</CssRoot>
