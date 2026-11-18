<script lang="ts">
	/**
	 * A week of opening hours: a closed toggle and one or two ranges per day,
	 * with Monday copied across. Shared by the `CmsHours` popover and the
	 * Company panel.
	 */
	import {
		DAY_KEYS,
		dayNames,
		type DayHours,
		type DayKey,
		type HoursRange
	} from '../../core/shapes/hours.js';
	import { cmsStore } from '../cms/cms-store.svelte.js';
	import { Button } from './ui/button/index.js';
	import { Input } from './ui/input/index.js';
	import { Switch } from './ui/switch/index.js';

	type Days = Record<DayKey, DayHours>;
	type Props = {
		days: Days;
		/** Shown beside a closed day. */
		closedLabel: string;
		onChange: (next: Days) => void;
	};
	let { days, closedLabel, onChange }: Props = $props();

	const names = $derived(dayNames(cmsStore.activeLocale || 'en', 'long'));
	const DEFAULT_RANGE: HoursRange = { open: '09:00', close: '17:00' };

	const setDay = (key: DayKey, patch: Partial<DayHours>) =>
		onChange({ ...days, [key]: { ...days[key], ...patch } });
	const setRange = (key: DayKey, index: number, patch: Partial<HoursRange>) =>
		setDay(key, {
			ranges: days[key].ranges.map((r, i) => (i === index ? { ...r, ...patch } : r))
		});
	const toggleClosed = (key: DayKey, closed: boolean) =>
		setDay(key, {
			closed,
			ranges: !closed && days[key].ranges.length === 0 ? [DEFAULT_RANGE] : days[key].ranges
		});
	const copyMonday = (keys: readonly DayKey[]) => {
		const mon = days.mon;
		const next = { ...days };
		for (const k of keys)
			next[k] = { closed: mon.closed, ranges: mon.ranges.map((r) => ({ ...r })) };
		onChange(next);
	};
</script>

<div class="vela:flex vela:flex-col vela:gap-2">
	{#each DAY_KEYS as key (key)}
		{@const day = days[key]}
		<div class="vela:flex vela:items-start vela:gap-2">
			<label
				class="vela:flex vela:w-24 vela:shrink-0 vela:items-center vela:gap-2 vela:pt-2 vela:text-[13px] vela:text-bar-text"
			>
				<Switch
					checked={!day.closed}
					onCheckedChange={(open) => toggleClosed(key, !open)}
					aria-label={`${names[key]} open`}
				/>
				<span class="vela:truncate">{names[key]}</span>
			</label>
			<div class="vela:flex vela:flex-1 vela:flex-col vela:gap-1">
				{#if day.closed}
					<span class="vela:pt-2 vela:text-[12px] vela:text-bar-text-tertiary">{closedLabel}</span>
				{:else}
					{#each day.ranges as range, i (i)}
						<div class="vela:flex vela:items-center vela:gap-1">
							<Input
								type="time"
								value={range.open}
								aria-label={`${names[key]} opens`}
								oninput={(e) => setRange(key, i, { open: e.currentTarget.value })}
							/>
							<span class="vela:text-bar-text-tertiary">–</span>
							<Input
								type="time"
								value={range.close}
								aria-label={`${names[key]} closes`}
								oninput={(e) => setRange(key, i, { close: e.currentTarget.value })}
							/>
							{#if day.ranges.length > 1}
								<Button
									size="icon"
									variant="ghost"
									class="vela:h-6 vela:w-6 vela:shrink-0"
									aria-label="Remove shift"
									onclick={() => setDay(key, { ranges: day.ranges.filter((_, j) => j !== i) })}
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
										setDay(key, { ranges: [...day.ranges, { open: '18:00', close: '22:00' }] })}
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
		<Button variant="outline" size="pill" onclick={() => copyMonday(['tue', 'wed', 'thu', 'fri'])}>
			Copy Monday to weekdays
		</Button>
		<Button variant="outline" size="pill" onclick={() => copyMonday(DAY_KEYS)}>Copy to all</Button>
	</div>
</div>
