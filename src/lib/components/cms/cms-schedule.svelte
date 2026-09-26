<script lang="ts" module>
	/** `CmsSchedule` preset: day, time, title, body, location. `scheduleByDay` groups them. */
	export type { CmsScheduleValue, ScheduleItem } from '../../core/shapes/presets.js';
	export { cmsSchedule, scheduleByDay } from '../../core/shapes/presets.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
	import {
		cmsSchedule,
		type CmsScheduleValue,
		type ScheduleItem
	} from '../../core/shapes/presets.js';

	type Props = {
		name: string;
		scope?: string;
		/** The full value, or a bare item list. */
		fallback?: Partial<CmsScheduleValue> | Partial<ScheduleItem>[];
		value?: unknown;
		children: Snippet<[ScheduleItem[]]>;
	};
	let { name, scope, fallback, value, children }: Props = $props();
</script>

<Structured
	schema={cmsSchedule}
	{name}
	{scope}
	{fallback}
	{value}
	view={(v: CmsScheduleValue) => v.items}
	{children}
/>
