<script lang="ts" module>
	/** `CmsStats` preset: value, label, note. */
	export type { CmsStatsValue, StatItem } from '../../core/shapes/presets.js';
	export { cmsStats } from '../../core/shapes/presets.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
	import { cmsStats, type CmsStatsValue, type StatItem } from '../../core/shapes/presets.js';

	type Props = {
		name: string;
		scope?: string;
		/** The full value, or a bare item list. */
		fallback?: Partial<CmsStatsValue> | Partial<StatItem>[];
		value?: unknown;
		children: Snippet<[StatItem[]]>;
	};
	let { name, scope, fallback, value, children }: Props = $props();
</script>

<Structured
	schema={cmsStats}
	{name}
	{scope}
	{fallback}
	{value}
	view={(v: CmsStatsValue) => v.items}
	{children}
/>
