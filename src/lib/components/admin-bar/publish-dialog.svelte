<script lang="ts">
	import type { ReleaseItem } from '../cms/cms-store.svelte.js';
	import { resolveRouteUrl } from './resolve-route.js';

	type Props = {
		items: ReleaseItem[];
		publishing: boolean;
		error: string | null;
		onConfirm: (name: string | undefined) => void;
		onClose: () => void;
	};
	let { items, publishing, error, onConfirm, onClose }: Props = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let name = $state('');

	$effect(() => {
		if (dialogEl && !dialogEl.open) dialogEl.showModal();
	});

	const itemKey = (item: ReleaseItem): string =>
		item.kind === 'page'
			? `page:${item.routeId}?${JSON.stringify(item.params)}`
			: `layout:${item.routeId}`;

	const itemLabel = (item: ReleaseItem): string => {
		if (item.kind === 'layout') return `Layout · ${item.routeId}`;
		const url = resolveRouteUrl(item.routeId, item.params);
		return `Page · ${url}`;
	};

	const submit = () => {
		if (publishing) return;
		const trimmed = name.trim();
		onConfirm(trimmed === '' ? undefined : trimmed);
	};
</script>

<dialog
	bind:this={dialogEl}
	class="cms-dialog"
	onclose={() => onClose()}
	onclick={(e) => {
		if (e.target === dialogEl) onClose();
	}}
>
	<form
		method="dialog"
		class="cms-dialog__body"
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<header>
			<h2>Publish release</h2>
			<p class="cms-dialog__subhead">
				{items.length} change{items.length === 1 ? '' : 's'} will go live atomically.
			</p>
		</header>

		<ul class="cms-dialog__list">
			{#each items as item (itemKey(item))}
				<li>{itemLabel(item)}</li>
			{/each}
		</ul>

		<label>
			<span>Name (optional)</span>
			<input
				type="text"
				placeholder="Spring relaunch"
				bind:value={name}
				disabled={publishing}
			/>
		</label>

		{#if error}
			<p class="cms-dialog__error" role="alert">{error}</p>
		{/if}

		<footer>
			<button
				type="button"
				class="cms-btn cms-btn--ghost"
				onclick={() => onClose()}
				disabled={publishing}
			>
				Cancel
			</button>
			<button type="submit" class="cms-btn cms-btn--primary" disabled={publishing}>
				{publishing ? 'Publishing…' : 'Publish'}
			</button>
		</footer>
	</form>
</dialog>

<style>
	:global(.cms-dialog__subhead) {
		margin: 0.25rem 0 0;
		font-size: 0.85rem;
		opacity: 0.7;
	}
	:global(.cms-dialog__list) {
		list-style: none;
		margin: 0;
		padding: 0.5rem 0.75rem;
		border-radius: 0.4rem;
		background: rgba(0, 0, 0, 0.04);
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-height: 14rem;
		overflow-y: auto;
		font-family: ui-monospace, monospace;
		font-size: 0.78rem;
	}
</style>
