<script lang="ts" module>
	/** `CmsTimeline` preset: date, title, body, image. */
	export type { CmsTimelineValue, TimelineItem } from '../../core/shapes/presets.js';
	export { cmsTimeline } from '../../core/shapes/presets.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
	import {
		cmsTimeline,
		type CmsTimelineValue,
		type TimelineItem
	} from '../../core/shapes/presets.js';

	type Props = {
		name: string;
		scope?: string;
		/** The full value, or a bare item list. */
		fallback?: Partial<CmsTimelineValue> | Partial<TimelineItem>[];
		value?: unknown;
		children: Snippet<[TimelineItem[]]>;
	};
	let { name, scope, fallback, value, children }: Props = $props();
</script>

<Structured
	schema={cmsTimeline}
	{name}
	{scope}
	{fallback}
	{value}
	view={(v: CmsTimelineValue) => v.items}
	{children}
/>
