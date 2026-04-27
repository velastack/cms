<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { normalizeField, type CmsNewPageConfig } from './new-page-config.js';

	type Props = {
		config: CmsNewPageConfig;
		creating: boolean;
		error: string | null;
		onCreate: (values: Record<string, string>) => void;
		onClose: () => void;
	};

	let { config, creating, error, onCreate, onClose }: Props = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let values = new SvelteMap<string, string>();

	const fields = $derived(config.fields.map(normalizeField));

	$effect.pre(() => {
		for (const f of fields) {
			if (!values.has(f.name)) values.set(f.name, '');
		}
	});

	$effect(() => {
		if (dialogEl && !dialogEl.open) dialogEl.showModal();
	});

	const allFilled = $derived(fields.every((f) => (values.get(f.name) ?? '').trim() !== ''));

	const submit = () => {
		if (!allFilled || creating) return;
		const out: Record<string, string> = {};
		for (const f of fields) out[f.name] = values.get(f.name) ?? '';
		onCreate(out);
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
			<h2>New {config.type}</h2>
		</header>

		<div class="cms-dialog__fields">
			{#each fields as f (f.name)}
				<label>
					<span>{f.label}</span>
					<input
						type="text"
						placeholder={f.placeholder}
						value={values.get(f.name) ?? ''}
						oninput={(e) => values.set(f.name, e.currentTarget.value)}
						disabled={creating}
					/>
				</label>
			{/each}
		</div>

		{#if error}
			<p class="cms-dialog__error" role="alert">{error}</p>
		{/if}

		<footer>
			<button
				type="button"
				class="cms-btn cms-btn--ghost"
				onclick={() => onClose()}
				disabled={creating}
			>
				Cancel
			</button>
			<button
				type="submit"
				class="cms-btn cms-btn--primary"
				disabled={!allFilled || creating}
			>
				{creating ? 'Creating…' : 'Create'}
			</button>
		</footer>
	</form>
</dialog>
