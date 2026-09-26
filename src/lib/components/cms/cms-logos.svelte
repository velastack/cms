<script lang="ts" module>
	/** `CmsLogos` preset: logo image, name, optional link. */
	export type { CmsLogosValue, LogoItem, LogoItemView } from '../../core/shapes/presets.js';
	export { cmsLogos, logosView } from '../../core/shapes/presets.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
	import {
		cmsLogos,
		logosView,
		type CmsLogosValue,
		type LogoItem,
		type LogoItemView
	} from '../../core/shapes/presets.js';

	type Props = {
		name: string;
		scope?: string;
		/** The full value, or a bare item list. */
		fallback?: Partial<CmsLogosValue> | Partial<LogoItem>[];
		value?: unknown;
		children: Snippet<[LogoItemView[]]>;
	};
	let { name, scope, fallback, value, children }: Props = $props();
</script>

<Structured schema={cmsLogos} {name} {scope} {fallback} {value} view={logosView} {children} />
