<script lang="ts" module>
	/** `CmsSteps` preset: title, body, image. */
	export type { CmsStepsValue, StepItem } from '../../core/shapes/presets.js';
	export { cmsSteps } from '../../core/shapes/presets.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
	import { cmsSteps, type CmsStepsValue, type StepItem } from '../../core/shapes/presets.js';

	type Props = {
		name: string;
		scope?: string;
		/** The full value, or a bare item list. */
		fallback?: Partial<CmsStepsValue> | Partial<StepItem>[];
		value?: unknown;
		children: Snippet<[StepItem[]]>;
	};
	let { name, scope, fallback, value, children }: Props = $props();
</script>

<Structured
	schema={cmsSteps}
	{name}
	{scope}
	{fallback}
	{value}
	view={(v: CmsStepsValue) => v.items}
	{children}
/>
