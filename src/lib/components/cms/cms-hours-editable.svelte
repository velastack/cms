<script lang="ts">
	/**
	 * The bespoke editor for `CmsHours`: a week grid (closed toggle, one or
	 * two ranges per day, copy Monday across) above the shape's other fields
	 * (note, exceptions, labels) rendered through the generic form.
	 */
	import type { Snippet } from 'svelte';
	import type { Tree } from '../../core/path.js';
	import type { FormShape } from '../../core/shapes/form.js';
	import {
		DAY_KEYS,
		dayNames,
		type CmsHoursValue,
		type DayKey,
		type HoursRange
	} from '../../core/shapes/hours.js';
	import type { CmsField } from './use-cms-field.svelte.js';
	import { cmsStore } from './cms-store.svelte.js';
	import StructuredEditorPopover from '../admin-bar/structured-editor-popover.svelte';
	import FieldsForm from '../admin-bar/fields-form.svelte';
	import { Button } from '../admin-bar/ui/button/index.js';
	import { Input } from '../admin-bar/ui/input/index.js';
	import { Switch } from '../admin-bar/ui/switch/index.js';

	type Props = {
		field: CmsField<CmsHoursValue>;
		schema: FormShape<CmsHoursValue>;
		preview: Snippet;
	};
	let { field, schema, preview }: Props = $props();

	const names = $derived(dayNames(cmsStore.activeLocale || 'en', 'long'));
	const DEFAULT_RANGE: HoursRange = { open: '09:00', close: '17:00' };

	const setDay = (
		draft: CmsHoursValue,
		key: DayKey,
		patch: Partial<CmsHoursValue['days'][DayKey]>
	) => ({
		...draft,
		days: { ...draft.days, [key]: { ...draft.days[key], ...patch } }
	});
	const setRange = (
		draft: CmsHoursValue,
		key: DayKey,
		index: number,
		patch: Partial<HoursRange>
	): CmsHoursValue =>
		setDay(draft, key, {
			ranges: draft.days[key].ranges.map((r, i) => (i === index ? { ...r, ...patch } : r))
		});
	const toggleClosed = (draft: CmsHoursValue, key: DayKey, closed: boolean): CmsHoursValue =>
		setDay(draft, key, {
			closed,
			ranges:
				!closed && draft.days[key].ranges.length === 0 ? [DEFAULT_RANGE] : draft.days[key].ranges
		});
	const copyMonday = (draft: CmsHoursValue, keys: readonly DayKey[]): CmsHoursValue => {
		const mon = draft.days.mon;
		const days = { ...draft.days };
		for (const k of keys)
			days[k] = { closed: mon.closed, ranges: mon.ranges.map((r) => ({ ...r })) };
		return { ...draft, days };
	};
</script>

<StructuredEditorPopover {field} {schema} label={schema.label} {preview}>
	{#snippet editor(draft: CmsHoursValue, update: (next: CmsHoursValue) => void)}
		<div class="vela:flex vela:flex-col vela:gap-2">
			{#each DAY_KEYS as key (key)}
				{@const day = draft.days[key]}
				<div class="vela:flex vela:items-start vela:gap-2">
					<label
						class="vela:flex vela:w-24 vela:shrink-0 vela:items-center vela:gap-2 vela:pt-2 vela:text-[13px] vela:text-bar-text"
					>
						<Switch
							checked={!day.closed}
							onCheckedChange={(open) => update(toggleClosed(draft, key, !open))}
							aria-label={`${names[key]} open`}
						/>
						<span class="vela:truncate">{names[key]}</span>
					</label>
					<div class="vela:flex vela:flex-1 vela:flex-col vela:gap-1">
						{#if day.closed}
							<span class="vela:pt-2 vela:text-[12px] vela:text-bar-text-tertiary"
								>{draft.labels.closed}</span
							>
						{:else}
							{#each day.ranges as range, i (i)}
								<div class="vela:flex vela:items-center vela:gap-1">
									<Input
										type="time"
										value={range.open}
										aria-label={`${names[key]} opens`}
										oninput={(e) =>
											update(setRange(draft, key, i, { open: e.currentTarget.value }))}
									/>
									<span class="vela:text-bar-text-tertiary">–</span>
									<Input
										type="time"
										value={range.close}
										aria-label={`${names[key]} closes`}
										oninput={(e) =>
											update(setRange(draft, key, i, { close: e.currentTarget.value }))}
									/>
									{#if day.ranges.length > 1}
										<Button
											size="icon"
											variant="ghost"
											class="vela:h-6 vela:w-6 vela:shrink-0"
											aria-label="Remove shift"
											onclick={() =>
												update(
													setDay(draft, key, { ranges: day.ranges.filter((_, j) => j !== i) })
												)}
										>
											×
										</Button>
									{:else}
										<Button
											size="xs"
											variant="ghost"
											class="vela:shrink-0"
											aria-label="Add a second shift"
											onclick={() =>
												update(
													setDay(draft, key, {
														ranges: [...day.ranges, { open: '18:00', close: '22:00' }]
													})
												)}
										>
											+ Split
										</Button>
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				</div>
			{/each}
			<div class="vela:flex vela:gap-1.5">
				<Button
					variant="outline"
					size="pill"
					onclick={() => update(copyMonday(draft, ['tue', 'wed', 'thu', 'fri']))}
				>
					Copy Monday to weekdays
				</Button>
				<Button variant="outline" size="pill" onclick={() => update(copyMonday(draft, DAY_KEYS))}>
					Copy to all
				</Button>
			</div>
		</div>
		<FieldsForm
			fields={schema.fields}
			value={draft as unknown as Tree}
			onChange={(next) => update(next as unknown as CmsHoursValue)}
		/>
	{/snippet}
</StructuredEditorPopover>
