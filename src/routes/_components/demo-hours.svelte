<script lang="ts" module>
	/**
	 * Showcase-only structured component: opening hours. It exists to exercise
	 * the Workstream A foundations end to end — `defineStructured`,
	 * `useCmsField`, `StructuredEditorPopover`, reorder buttons and the `$t`
	 * translation tab. The real `CmsHours` ships with the editor components.
	 */
	import { asItems, asString, defineStructured } from '$lib/core/structured.js';
	import { registerStructured } from '$lib/components/cms/structured-registry.js';

	export type DemoHoursValue = {
		v: 1;
		note: string;
		days: Array<{ id: string; label: string; open: string; close: string }>;
	};

	export const demoHours = registerStructured(
		defineStructured<DemoHoursValue>({
			component: 'DemoHours',
			version: 1,
			translatable: ['note'],
			items: { key: 'days', translatable: ['label'] },
			normalize: (raw) => {
				const r = (raw ?? {}) as Record<string, unknown>;
				return {
					v: 1,
					note: asString(r.note),
					days: asItems(r.days, (d) => ({
						label: asString(d.label),
						open: asString(d.open),
						close: asString(d.close)
					}))
				};
			},
			empty: () => ({ v: 1, note: '', days: [] })
		})
	);
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { useCmsField } from '$lib/components/cms/use-cms-field.svelte.js';
	import { newItemId } from '$lib/core/structured.js';

	type Props = {
		name: string;
		scope?: string;
		fallback?: DemoHoursValue;
		children: Snippet<[DemoHoursValue]>;
	};
	let { name, scope, fallback, children }: Props = $props();

	const field = useCmsField(
		() => ({ name, scope }),
		(raw) => demoHours.read(raw, fallback)
	);

	let open = $state(false);

	const move = (days: DemoHoursValue['days'], from: number, to: number) => {
		const next = [...days];
		const [d] = next.splice(from, 1);
		next.splice(to, 0, d);
		return next;
	};
</script>

{#if field.editable}
	{#await Promise.all( [import('$lib/components/admin-bar/structured-editor-popover.svelte'), import('$lib/components/admin-bar/reorder-buttons.svelte'), import('$lib/components/admin-bar/field-input.svelte'), import('$lib/components/admin-bar/ui/button/index.js')] ) then [{ default: Popover }, { default: Reorder }, { default: FieldInput }, { Button }]}
		<Popover {field} schema={demoHours} label="Opening hours" bind:open>
			{#snippet preview()}
				{@render children(field.current)}
			{/snippet}
			{#snippet editor(draft: DemoHoursValue, update: (next: DemoHoursValue) => void)}
				{#each draft.days as day, i (day.id)}
					<div class="vela:flex vela:items-end vela:gap-2">
						<FieldInput
							type="text"
							label={i === 0 ? 'Day' : undefined}
							value={day.label}
							onChange={(v) =>
								update({
									...draft,
									days: draft.days.map((d) =>
										d.id === day.id ? { ...d, label: String(v ?? '') } : d
									)
								})}
							class="vela:flex-1"
						/>
						<FieldInput
							type="time"
							label={i === 0 ? 'Open' : undefined}
							value={day.open}
							onChange={(v) =>
								update({
									...draft,
									days: draft.days.map((d) =>
										d.id === day.id ? { ...d, open: String(v ?? '') } : d
									)
								})}
						/>
						<FieldInput
							type="time"
							label={i === 0 ? 'Close' : undefined}
							value={day.close}
							onChange={(v) =>
								update({
									...draft,
									days: draft.days.map((d) =>
										d.id === day.id ? { ...d, close: String(v ?? '') } : d
									)
								})}
						/>
						<Reorder
							index={i}
							count={draft.days.length}
							label="day"
							onMove={(from, to) => update({ ...draft, days: move(draft.days, from, to) })}
							onRemove={(idx) => update({ ...draft, days: draft.days.filter((_, j) => j !== idx) })}
						/>
					</div>
				{/each}
				<Button
					variant="outline"
					size="pill"
					class="vela:self-start"
					onclick={() =>
						update({
							...draft,
							days: [...draft.days, { id: newItemId(), label: '', open: '09:00', close: '17:00' }]
						})}
				>
					+ Add day
				</Button>
				<FieldInput
					type="text"
					label="Note"
					value={draft.note}
					onChange={(v) => update({ ...draft, note: String(v ?? '') })}
				/>
			{/snippet}
		</Popover>
	{/await}
{:else}
	{@render children(field.current)}
{/if}
