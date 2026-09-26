<script lang="ts" module>
	/** `CmsGallery` preset: image and caption. */
	export type { CmsGalleryValue, GalleryItem } from '../../core/shapes/presets.js';
	export { cmsGallery } from '../../core/shapes/presets.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
	import { cmsGallery, type CmsGalleryValue, type GalleryItem } from '../../core/shapes/presets.js';

	type Props = {
		name: string;
		scope?: string;
		/** The full value, or a bare item list. */
		fallback?: Partial<CmsGalleryValue> | Partial<GalleryItem>[];
		value?: unknown;
		children: Snippet<[GalleryItem[]]>;
	};
	let { name, scope, fallback, value, children }: Props = $props();
</script>

<Structured
	schema={cmsGallery}
	{name}
	{scope}
	{fallback}
	{value}
	view={(v: CmsGalleryValue) => v.items.filter((i) => i.image !== null)}
	{children}
/>
