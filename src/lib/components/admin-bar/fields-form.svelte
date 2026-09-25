<script lang="ts">
	/**
	 * The generic structured form: one input per `FormField`, grouped into
	 * tabs when fields name a `group`, `half` fields sharing a row with the
	 * next one, and `list` fields rendered as cards through `ListField`.
	 * Works over a local draft: every change emits a new whole object.
	 */
	import type { FormField } from '../../core/shapes/form.js';
	import type { CmsImageValue } from '../../core/shapes/image.js';
	import type { CmsLinkValue } from '../../core/shapes/link.js';
	import { get, type Tree } from '../../core/path.js';
	import { setIn } from '../../core/structured.js';
	import FieldInput from './field-input.svelte';
	import LinkInput from './link-input.svelte';
	import RichTextInput from './rich-text-input.svelte';
	import ListField from './list-field.svelte';
	import { Button } from './ui/button/index.js';
	import { Textarea } from './ui/textarea/index.js';
	import * as Tabs from './ui/tabs/index.js';

	type Props = {
		fields: readonly FormField[];
		value: Tree;
		onChange: (next: Tree) => void;
	};
	let { fields, value, onChange }: Props = $props();

	const GENERAL = 'General';

	// Tabs: named groups in first-seen order; ungrouped fields share a
	// "General" tab that comes first. One group means no tabs at all.
	const groups = $derived.by(() => {
		const names: string[] = [];
		for (const f of fields) {
			const g = f.group ?? GENERAL;
			if (!names.includes(g)) names.push(g);
		}
		if (names.includes(GENERAL)) {
			names.splice(names.indexOf(GENERAL), 1);
			names.unshift(GENERAL);
		}
		return names.map((name) => ({
			name,
			rows: pairRows(fields.filter((f) => (f.group ?? GENERAL) === name))
		}));
	});
	let tab = $state('');
	$effect(() => {
		if (!groups.some((g) => g.name === tab)) tab = groups[0]?.name ?? '';
	});

	/** A `half` field shares its row with the field after it. */
	const pairRows = (list: readonly FormField[]): FormField[][] => {
		const rows: FormField[][] = [];
		for (let i = 0; i < list.length; i++) {
			const f = list[i];
			if (f.half && i + 1 < list.length && list[i + 1].type !== 'list') {
				rows.push([f, list[i + 1]]);
				i++;
			} else rows.push([f]);
		}
		return rows;
	};

	const read = (key: string): unknown => get(value, key);
	const write = (key: string, next: unknown) => onChange(setIn(value, key, next));

	const str = (v: unknown): string => (typeof v === 'string' ? v : '');
	const strings = (v: unknown): string[] =>
		Array.isArray(v) ? v.map((s) => (typeof s === 'string' ? s : '')) : [];
	const images = (v: unknown): CmsImageValue[] =>
		Array.isArray(v) ? (v.filter((i) => i && typeof i === 'object') as CmsImageValue[]) : [];
	const rating = (v: unknown): number => (typeof v === 'number' ? v : 0);
	const asObject = (v: unknown): Tree => (v && typeof v === 'object' ? (v as Tree) : { url: null });
</script>

{#snippet input(f: FormField)}
	{#if f.type === 'html'}
		<RichTextInput
			value={str(read(f.key))}
			label={f.label}
			onChange={(html) => write(f.key, html)}
		/>
	{:else if f.type === 'link'}
		<LinkInput
			value={(read(f.key) as CmsLinkValue | null) ?? null}
			label={f.label}
			onChange={(next) => write(f.key, next)}
		/>
	{:else if f.type === 'strings'}
		<label class="vela:flex vela:flex-col vela:gap-1.5">
			<span class="vela:text-[12px] vela:text-bar-text-secondary">{f.label}</span>
			<Textarea
				value={strings(read(f.key)).join('\n')}
				placeholder={f.placeholder ?? 'One per line'}
				oninput={(e) => write(f.key, e.currentTarget.value.split('\n'))}
			/>
		</label>
	{:else if f.type === 'rating'}
		<div class="vela:flex vela:flex-col vela:gap-1.5">
			<span class="vela:text-[12px] vela:text-bar-text-secondary">{f.label}</span>
			<div class="vela:flex vela:gap-0.5" role="radiogroup" aria-label={f.label}>
				{#each [1, 2, 3, 4, 5] as n (n)}
					<button
						type="button"
						role="radio"
						aria-checked={rating(read(f.key)) === n}
						aria-label={`${n} of 5`}
						class="vela:cursor-pointer vela:text-[18px] vela:leading-none {n <= rating(read(f.key))
							? 'vela:text-[var(--cms-status-warn-text)]'
							: 'vela:text-bar-text-tertiary'}"
						onclick={() => write(f.key, rating(read(f.key)) === n ? null : n)}
					>
						★
					</button>
				{/each}
			</div>
		</div>
	{:else if f.type === 'images'}
		{@const list = images(read(f.key))}
		<div class="vela:flex vela:flex-col vela:gap-2">
			<span class="vela:text-[12px] vela:text-bar-text-secondary">{f.label}</span>
			{#each list as img, i (i)}
				<div class="vela:flex vela:items-start vela:gap-2">
					<FieldInput
						type="image"
						value={img}
						onChange={(next) =>
							write(
								f.key,
								list.map((x, j) => (j === i ? next : x))
							)}
						class="vela:flex-1"
					/>
					<Button
						size="icon"
						variant="ghost"
						class="vela:h-9 vela:w-6 vela:shrink-0 vela:text-[var(--cms-status-error-text-base)]"
						aria-label="Remove image"
						onclick={() =>
							write(
								f.key,
								list.filter((_, j) => j !== i)
							)}
					>
						×
					</Button>
				</div>
			{/each}
			<Button
				variant="outline"
				size="pill"
				class="vela:self-start"
				onclick={() => write(f.key, [...list, { url: null }])}
			>
				+ Add image
			</Button>
		</div>
	{:else if f.type === 'image'}
		<FieldInput
			type="image"
			label={f.label}
			value={asObject(read(f.key))}
			placeholder={f.placeholder}
			onChange={(next) => write(f.key, next)}
		/>
	{:else if f.type === 'list'}
		<ListField
			label={f.label}
			itemLabel={f.itemLabel ?? 'item'}
			titleKey={f.titleKey}
			fields={f.fields ?? []}
			blank={f.blank ?? (() => ({}))}
			items={(read(f.key) as Tree[] | undefined) ?? []}
			onChange={(items) => write(f.key, items)}
		/>
	{:else}
		<FieldInput
			type={f.type}
			label={f.label}
			value={read(f.key)}
			placeholder={f.placeholder}
			values={f.values}
			names={f.names}
			onChange={(next) => write(f.key, next)}
		/>
	{/if}
{/snippet}

{#snippet rows(list: FormField[][])}
	{#each list as row, i (i)}
		{#if row.length === 2}
			<div class="vela:grid vela:grid-cols-2 vela:gap-2 vela:items-start">
				{@render input(row[0])}
				{@render input(row[1])}
			</div>
		{:else}
			{@render input(row[0])}
		{/if}
	{/each}
{/snippet}

{#if groups.length > 1}
	<Tabs.Root bind:value={tab}>
		<Tabs.List aria-label="Sections">
			{#each groups as g (g.name)}
				<Tabs.Trigger value={g.name}>{g.name}</Tabs.Trigger>
			{/each}
		</Tabs.List>
		{#each groups as g (g.name)}
			<Tabs.Content value={g.name} class="vela:flex vela:flex-col vela:gap-3 vela:pt-3">
				{@render rows(g.rows)}
			</Tabs.Content>
		{/each}
	</Tabs.Root>
{:else if groups.length === 1}
	{@render rows(groups[0].rows)}
{/if}
