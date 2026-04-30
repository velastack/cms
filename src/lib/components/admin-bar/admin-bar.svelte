<script lang="ts">
	import { untrack } from 'svelte';
	import { browser, building } from '$app/environment';
	import { beforeNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { cmsStore } from '$lib/components/cms/cms-store.svelte.js';

	const STORAGE_KEY = 'cms.editEnabled';
	const THEME_STORAGE_KEY = 'cms.theme';

	export type AdminBarTheme = 'system' | 'light' | 'dark';
	type Props = { theme?: AdminBarTheme };
	let { theme = 'system' }: Props = $props();

	type State = 'idle' | 'authed' | 'unauthed';
	let authState: State = $state('idle');
	let user: { id: string; name: string } | null = $state(null);
	let barEnabled = $state(false);

	// User's chosen theme preference. Initial value: localStorage override if
	// present (and valid), otherwise the `theme` prop. Persisted on every
	// change so the choice survives reloads. The prop is read once at mount —
	// after that, the user's selection from the View → Theme menu wins.
	const readStoredTheme = (): AdminBarTheme | null => {
		if (typeof localStorage === 'undefined') return null;
		const raw = localStorage.getItem(THEME_STORAGE_KEY);
		return raw === 'system' || raw === 'light' || raw === 'dark' ? raw : null;
	};
	let themePref = $state<AdminBarTheme>(
		untrack(() => (browser ? (readStoredTheme() ?? theme) : theme))
	);

	const setThemePref = (next: AdminBarTheme) => {
		themePref = next;
		try {
			localStorage.setItem(THEME_STORAGE_KEY, next);
		} catch {
			/* private mode etc. — non-fatal */
		}
	};

	// Resolves themePref to a concrete 'light' | 'dark' value, watching the
	// OS preference when pref is 'system'. The bar mounts client-only (see
	// {#if browser} below), so we don't need an SSR fallback.
	let systemPrefersDark = $state(false);
	$effect(() => {
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		systemPrefersDark = mq.matches;
		const handler = (e: MediaQueryListEvent) => (systemPrefersDark = e.matches);
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});
	const resolvedTheme = $derived<'light' | 'dark'>(
		themePref === 'system' ? (systemPrefersDark ? 'dark' : 'light') : themePref
	);

	const endpoint = $derived(page.data.cms?.endpoint ?? '/api/cms');
	const editParam = $derived(page.url.searchParams.has('edit'));

	$effect(() => {
		if (editParam) {
			localStorage.setItem(STORAGE_KEY, '1');
			barEnabled = true;
			const url = new URL(page.url);
			url.searchParams.delete('edit');
			const path = url.pathname + url.search + url.hash;
			const st = page.state;
			const t = setTimeout(() => {
				replaceState(path, st);
			}, 0);
			return () => clearTimeout(t);
		} else if (localStorage.getItem(STORAGE_KEY) === '1') {
			barEnabled = true;
		}
	});

	$effect(() => {
		if (!barEnabled) return;
		fetch(`${endpoint}/user`, { credentials: 'include' })
			.then(async (r) => {
				if (r.status === 200) {
					const data = await r.json();
					user = data.user;
					authState = 'authed';
				} else {
					authState = 'unauthed';
				}
			})
			.catch(() => {
				authState = 'unauthed';
			});
	});

	beforeNavigate((nav) => {
		if (!cmsStore.isDirty) return;
		if (!confirm('You have unsaved changes. Leave anyway?')) {
			nav.cancel();
		}
	});

	$effect(() => {
		const handler = (e: BeforeUnloadEvent) => {
			if (!cmsStore.isDirty) return;
			e.preventDefault();
			e.returnValue = '';
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	const closeBar = () => {
		if (cmsStore.isDirty && !confirm('Discard unsaved changes?')) return;
		cmsStore.clearDrafts();
		cmsStore.isEditing = false;
		localStorage.removeItem(STORAGE_KEY);
		barEnabled = false;
		authState = 'idle';
		user = null;
		const url = new URL(page.url);
		if (url.searchParams.has('preview')) {
			url.searchParams.delete('preview');
			replaceState(url.pathname + url.search + url.hash, page.state);
		}
	};
</script>

{#if browser}
	{#if barEnabled && authState === 'authed' && user}
		{#await import('./admin-bar-internal.svelte') then { default: Internal }}
			<Internal {user} {endpoint} onClose={closeBar} {themePref} {setThemePref} {resolvedTheme} />
		{/await}
	{:else if barEnabled && authState === 'unauthed'}
		<div class="cms-signin">
			<span>Sign in to edit this site</span>
			<button type="button" class="cms-signin__close" aria-label="Close" onclick={closeBar}
				>×</button
			>
		</div>
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
</style>
