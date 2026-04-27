<script lang="ts">
	import { browser } from '$app/environment';
	import { beforeNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { cmsStore } from '../cms/cms-store.svelte.js';

	const STORAGE_KEY = 'cms.editEnabled';

	type State = 'idle' | 'authed' | 'unauthed';
	let authState: State = $state('idle');
	let user: { id: string; name: string } | null = $state(null);
	let barEnabled = $state(false);

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
		fetch(`${endpoint}/user`)
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
	};
</script>

{#if browser}
	{#if barEnabled && authState === 'authed' && user}
		{#await import('./admin-bar-internal.svelte') then { default: Internal }}
			<Internal {user} {endpoint} onClose={closeBar} />
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
