<script lang="ts">
	/**
	 * A list of items inside a structured form: one collapsible card per
	 * item, up/down/remove buttons, and an add button. Every item carries a
	 * stable `id` (new ones get a random one), so translations and reorders
	 * never lose track of an item.
	 */
	import type { FormField } from '../../core/shapes/form.js';
	import type { Tree } from '../../core/path.js';
	import { moveItem, newItemId } from '../../core/structured.js';
	import FieldsForm from './fields-form.svelte';
	import ReorderButtons from './reorder-buttons.svelte';
	import ChevronDownIcon from './icons/chevron-down.svelte';
	import ChevronRightIcon from './icons/chevron-right.svelte';
	import { Button } from './ui/button/index.js';

	type Props = {
		label: string;
		itemLabel: string;
		titleKey?: string;
		fields: readonly FormField[];
		blank: () => Tree;
		items: Tree[];
		onChange: (items: Tree[]) => void;
	};
	let { label, itemLabel, titleKey, fields, blank, items, onChange }: Props = $props();

	let open = $state(new Set<string>());
	const toggle = (id: string) => {
		const next = new Set(open);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		open = next;
	};

	const idOf = (item: Tree, i: number): string =>
		typeof item.id === 'string' && item.id !== '' ? item.id : `item-${i}`;

	const titleOf = (item: Tree, i: number): string => {
		const t = titleKey ? item[titleKey] : undefined;
		if (typeof t === 'string' && t.trim() !== '') return t;
		return `${itemLabel[0].toUpperCase()}${itemLabel.slice(1)} ${i + 1}`;
	};

	const add = () => {
		const id = newItemId();
		onChange([...items, { id, ...blank() }]);
		open = new Set([...open, id]);
	};
	const replace = (i: number, next: Tree) => onChange(items.map((it, j) => (j === i ? next : it)));
</script>

<div class="vela:flex vela:flex-col vela:gap-2">
	<span class="vela:text-[12px] vela:text-bar-text-secondary">{label}</span>
	{#each items as item, i (idOf(item, i))}
		{@const id = idOf(item, i)}
		{@const expanded = open.has(id)}
		<div class="vela:rounded-md vela:border vela:border-[var(--cms-bar-divider)]">
			<div class="vela:flex vela:items-center vela:gap-1 vela:pl-1 vela:pr-1.5 vela:py-1">
				<button
					type="button"
					class="vela:flex vela:flex-1 vela:min-w-0 vela:items-center vela:gap-1.5 vela:cursor-pointer vela:text-left vela:text-[13px] vela:text-bar-text"
					aria-expanded={expanded}
					onclick={() => toggle(id)}
				>
					{#if expanded}
						<ChevronDownIcon class="vela:size-3.5 vela:shrink-0 vela:text-bar-text-tertiary" />
					{:else}
						<ChevronRightIcon class="vela:size-3.5 vela:shrink-0 vela:text-bar-text-tertiary" />
					{/if}
					<span class="vela:truncate">{titleOf(item, i)}</span>
				</button>
				<ReorderButtons
					index={i}
					count={items.length}
					label={itemLabel}
					onMove={(from, to) => onChange(moveItem(items, from, to))}
					onRemove={(idx) => onChange(items.filter((_, j) => j !== idx))}
				/>
			</div>
			{#if expanded}
				<div
					class="vela:flex vela:flex-col vela:gap-3 vela:border-t vela:border-[var(--cms-bar-divider)] vela:p-3"
				>
					<FieldsForm {fields} value={item} onChange={(next) => replace(i, next)} />
				</div>
			{/if}
		</div>
	{/each}
	<Button variant="outline" size="pill" class="vela:self-start" onclick={add}>
		+ Add {itemLabel}
	</Button>
</div>
