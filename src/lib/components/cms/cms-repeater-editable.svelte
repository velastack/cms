<script lang="ts" generics="T extends Record<string, unknown>">
	import type { Snippet } from 'svelte';
	import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';

	type Props = {
		scope: CmsScopeRef;
		name: string;
		items: T[];
		children: Snippet<[T, number]>;
	};

	let { scope, name, items, children }: Props = $props();

	/** Build a blank item from the keys of the first existing item. */
	const blankItem = (): T => {
		const template = items[0];
		const out: Record<string, unknown> = {};
		if (template) for (const k of Object.keys(template)) out[k] = '';
		return out as T;
	};

	const commit = (next: T[]) => cmsStore.setValue(scope, name, next);

	const removeItem = (index: number) => commit(items.filter((_, i) => i !== index));
	const addItem = () => commit([...items, blankItem()]);
	const updateItem = (index: number, patch: Partial<T>) =>
		commit(items.map((item, i) => (i === index ? ({ ...item, ...patch } as T) : item)));
</script>

<ul class="cms-repeater-editable">
	{#each items as item, i (i)}
		<li class="cms-repeater-editable__item">
			<div class="cms-repeater-editable__preview">
				{@render children(item, i)}
			</div>
			<details class="cms-repeater-editable__fields">
				<summary>Fields</summary>
				{#each Object.keys(item) as key}
					<label>
						<span>{key}</span>
						<input
							type="text"
							value={String(item[key] ?? '')}
							oninput={(e) =>
								updateItem(i, { [key]: (e.target as HTMLInputElement).value } as Partial<T>)}
						/>
					</label>
				{/each}
			</details>
			<button
				type="button"
				class="cms-repeater-editable__remove"
				aria-label="Remove item"
				onclick={() => removeItem(i)}
			>
				×
			</button>
		</li>
	{/each}
</ul>
<button type="button" class="cms-repeater-editable__add" onclick={addItem}>+ Add item</button>

<style>
	.cms-repeater-editable {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.cms-repeater-editable__item {
		position: relative;
		padding: 0.5rem;
		border: 1px dashed rgba(127, 127, 127, 0.6);
		border-radius: 0.25rem;
		background: rgba(127, 127, 127, 0.06);
	}
	.cms-repeater-editable__remove {
		position: absolute;
		top: 0.25rem;
		right: 0.25rem;
		width: 1.5rem;
		height: 1.5rem;
		border: 0;
		border-radius: 9999px;
		background: rgba(220, 38, 38, 0.1);
		color: rgb(220, 38, 38);
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
	}
	.cms-repeater-editable__remove:hover {
		background: rgba(220, 38, 38, 0.2);
	}
	.cms-repeater-editable__fields {
		margin-top: 0.5rem;
		font-size: 0.85em;
	}
	.cms-repeater-editable__fields summary {
		cursor: pointer;
		color: rgba(127, 127, 127, 0.9);
	}
	.cms-repeater-editable__fields label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.375rem;
	}
	.cms-repeater-editable__fields label span {
		flex: 0 0 6rem;
		font-family: ui-monospace, monospace;
		color: rgba(127, 127, 127, 0.9);
	}
	.cms-repeater-editable__fields input {
		flex: 1;
		padding: 0.25rem 0.5rem;
		border: 1px solid rgba(127, 127, 127, 0.4);
		border-radius: 0.25rem;
		background: canvas;
		color: inherit;
		font: inherit;
	}
	.cms-repeater-editable__add {
		margin-top: 0.5rem;
		padding: 0.375rem 0.75rem;
		border: 1px dashed rgba(127, 127, 127, 0.6);
		border-radius: 0.25rem;
		background: transparent;
		color: inherit;
		cursor: pointer;
		font: inherit;
	}
	.cms-repeater-editable__add:hover {
		background: rgba(127, 127, 127, 0.06);
	}
</style>
