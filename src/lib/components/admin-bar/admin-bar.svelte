<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { beforeNavigate, goto, invalidateAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { cmsStore } from '$lib/components/cms/cms-store.svelte.js';
	import { adminBarTheme, type AdminBarTheme } from './theme.svelte.js';

	const STORAGE_KEY = 'cms.editEnabled';
	const THEME_STORAGE_KEY = 'cms.theme';

	type Props = { theme?: AdminBarTheme };
	let { theme = 'system' }: Props = $props();

	type AuthState = 'idle' | 'authed' | 'unauthed';
	let authState: AuthState = $state('idle');
	let user: { id: string; name: string } | null = $state(null);
	let barEnabled = $state(false);
	let signinOpen = $state(false);

	const endpoint = $derived(page.data.cms?.endpoint ?? '/api/cms');
	const endpointOrigin = $derived.by(() => {
		if (!browser) return null;
		try {
			return new URL(endpoint, location.href).origin;
		} catch {
			return null;
		}
	});

	// ── Auth fetch ────────────────────────────────────────────────────
	// Single source of truth for `authState` / `user`. Called explicitly
	// from bootstrap and the post-login postMessage handler.
	async function refetchUser() {
		try {
			const r = await fetch(`${endpoint}/user`, { credentials: 'include' });
			if (r.status === 200) {
				const data = await r.json();
				user = data.user;
				authState = 'authed';
				return;
			}
		} catch {
			// fall through
		}
		user = null;
		authState = 'unauthed';
	}

	// ── Bootstrap (once, browser only) ────────────────────────────────
	// `?edit` is treated as a one-time signal at component init — paste
	// `?edit` + reload to open the bar; thereafter the persisted
	// `cms.editEnabled` flag keeps it open. We deliberately do NOT
	// react to `?edit` mid-session: a $effect on it would unconditionally
	// re-set `cms.editEnabled='1'` and `barEnabled=true` every time the
	// URL changed (including the replaceState we issue from teardown),
	// resurrecting the bar after `closeBar`/`onLogout`.
	if (browser) {
		untrack(() => {
			if (localStorage.getItem(THEME_STORAGE_KEY) === null && theme !== adminBarTheme.pref) {
				adminBarTheme.pref = theme;
			}

			const hasEditParam = page.url.searchParams.has('edit');
			const stored = localStorage.getItem(STORAGE_KEY) === '1';

			if (hasEditParam) {
				localStorage.setItem(STORAGE_KEY, '1');
				barEnabled = true;
				// Strip `?edit` so reloads don't re-grant access without the persisted flag.
				const url = new URL(page.url);
				url.searchParams.delete('edit');
				const path = url.pathname + url.search + url.hash;
				setTimeout(() => replaceState(path, page.state), 0);
			} else if (stored) {
				barEnabled = true;
			}

			if (barEnabled) void refetchUser();
		});
	}

	// ── Sign-in popover: postMessage + outside-click ──────────────────
	// One effect for the popover's lifetime; both listeners share the
	// same gate (`signinOpen`).
	$effect(() => {
		if (!signinOpen) return;

		const onMessage = (event: MessageEvent) => {
			if (endpointOrigin && event.origin !== endpointOrigin) return;
			if (typeof event.data !== 'object' || event.data === null) return;
			if ((event.data as { type?: unknown }).type !== 'velastack-cms-login-success') return;
			signinOpen = false;
			void refetchUser();
		};

		const onMouseDown = (event: MouseEvent) => {
			const target = event.target as Element | null;
			if (target?.closest('.cms-signin-popover, .cms-signin')) return;
			signinOpen = false;
		};

		window.addEventListener('message', onMessage);
		document.addEventListener('mousedown', onMouseDown);
		return () => {
			window.removeEventListener('message', onMessage);
			document.removeEventListener('mousedown', onMouseDown);
		};
	});

	// ── Unsaved-changes guard ─────────────────────────────────────────
	beforeNavigate((nav) => {
		if (!cmsStore.isDirty) return;
		if (!confirm('You have unsaved changes. Leave anyway?')) nav.cancel();
	});

	$effect(() => {
		const onUnload = (e: BeforeUnloadEvent) => {
			if (!cmsStore.isDirty) return;
			e.preventDefault();
			e.returnValue = '';
		};
		window.addEventListener('beforeunload', onUnload);
		return () => window.removeEventListener('beforeunload', onUnload);
	});

	// ── Cmd/Ctrl+E to toggle the bar ──────────────────────────────────
	// Closed → open behaves like arriving with `?edit` but never touches
	// the URL. Open → closed runs the same teardown as the × button.
	// `stopImmediatePropagation` keeps `admin-bar-internal`'s own Cmd+E
	// (toggle `cmsStore.isEditing`) from firing on the same keypress.
	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (!(e.metaKey || e.ctrlKey)) return;
			if (e.key.toLowerCase() !== 'e') return;

			if (authState === 'unauthed' || authState === 'idle') {
				e.preventDefault();
				e.stopImmediatePropagation();
				if (barEnabled) {
					closeBar();
				} else {
					localStorage.setItem(STORAGE_KEY, '1');
					barEnabled = true;
					void refetchUser();
				}
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	// ── Teardown (shared by closeBar + onLogout) ──────────────────────
	const stripUrlParams = (...keys: string[]) => {
		const url = new URL(page.url);
		let changed = false;
		for (const k of keys) {
			if (url.searchParams.has(k)) {
				url.searchParams.delete(k);
				changed = true;
			}
		}
		if (!changed) return;
		goto(url);
	};

	// Reset every input that keeps the bar visible. Also clears the
	// `cmsStore` release/overlay state so any in-flight effects in
	// `admin-bar-internal` (which may resolve their async work after we
	// unmount) can't re-add `?preview` from a stale `openRelease`, and
	// so the page renders pure published content immediately.
	const tearDownBar = () => {
		cmsStore.clearDrafts();
		cmsStore.clearOverlay();
		cmsStore.setOpenRelease(null);
		cmsStore.isEditing = false;
		localStorage.removeItem(STORAGE_KEY);
		barEnabled = false;
		signinOpen = false;
		authState = 'idle';
		user = null;
		stripUrlParams('edit', 'preview');
	};

	const closeBar = () => {
		if (cmsStore.isDirty && !confirm('Discard unsaved changes?')) return;
		tearDownBar();
	};

	const onLogout = async () => {
		if (cmsStore.isDirty && !confirm('Discard unsaved changes?')) return;
		try {
			await fetch(`${endpoint}/logout`, { method: 'POST', credentials: 'include' });
		} catch {
			// Server call failed; tear down locally regardless.
		}
		tearDownBar();
	};
</script>

{#if browser}
	{#if barEnabled && authState === 'authed' && user}
		{#await import('./admin-bar-internal.svelte') then { default: Internal }}
			<Internal {user} {endpoint} onClose={closeBar} {onLogout} />
		{/await}
	{:else if barEnabled && authState === 'unauthed'}
		<div class="cms-signin">
			<span>Sign in to edit this site</span>
			<button type="button" class="cms-signin__signin" onclick={() => (signinOpen = !signinOpen)}
				>Sign in</button
			>
			<button type="button" class="cms-signin__close" aria-label="Close" onclick={closeBar}
				>×</button
			>
		</div>
		{#if signinOpen}
			<div class="cms-signin-popover" role="dialog" aria-label="Sign in">
				<div class="cms-signin-popover__header">
					<span>Sign in</span>
					<button
						type="button"
						class="cms-signin-popover__close"
						aria-label="Close"
						onclick={() => (signinOpen = false)}>×</button
					>
				</div>
				<iframe class="cms-signin-popover__iframe" src={`${endpoint}/iframe/login`} title="Sign in"
				></iframe>
			</div>
		{/if}
	{/if}
{/if}

<style>
	.cms-signin {
		position: fixed;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.4rem 0.3rem 0.7rem;
		border-radius: 9999px;
		background: rgba(20, 20, 20, 0.7);
		color: rgba(250, 250, 250, 0.85);
		backdrop-filter: blur(8px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		font-family:
			ui-sans-serif,
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			sans-serif;
		font-size: 0.75rem;
		z-index: 9999;
	}
	.cms-signin__close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 9999px;
		border: none;
		background: rgba(255, 255, 255, 0.08);
		color: inherit;
		cursor: pointer;
		font: inherit;
		font-size: 0.9rem;
		line-height: 1;
		padding: 0;
	}
	.cms-signin__close:hover {
		background: rgba(255, 255, 255, 0.18);
	}
	.cms-signin__signin {
		display: inline-flex;
		align-items: center;
		height: 1.25rem;
		padding: 0 0.6rem;
		border-radius: 9999px;
		border: none;
		background: rgba(255, 255, 255, 0.14);
		color: inherit;
		cursor: pointer;
		font: inherit;
		font-size: 0.7rem;
		line-height: 1;
	}
	.cms-signin__signin:hover {
		background: rgba(255, 255, 255, 0.24);
	}
	.cms-signin-popover {
		position: fixed;
		top: 3.5rem;
		left: 50%;
		transform: translateX(-50%);
		width: 380px;
		height: 480px;
		max-width: calc(100vw - 2rem);
		max-height: calc(100vh - 4.5rem);
		background: #fff;
		color: #111;
		border-radius: 0.75rem;
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		z-index: 9999;
		font-family:
			ui-sans-serif,
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			sans-serif;
	}
	.cms-signin-popover__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.5rem 0.5rem 0.875rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: rgba(0, 0, 0, 0.6);
		border-bottom: 1px solid rgba(0, 0, 0, 0.08);
	}
	.cms-signin-popover__close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 9999px;
		border: none;
		background: transparent;
		color: inherit;
		cursor: pointer;
		font: inherit;
		font-size: 1rem;
		line-height: 1;
		padding: 0;
	}
	.cms-signin-popover__close:hover {
		background: rgba(0, 0, 0, 0.06);
	}
	.cms-signin-popover__iframe {
		flex: 1;
		width: 100%;
		border: 0;
		display: block;
	}
</style>
