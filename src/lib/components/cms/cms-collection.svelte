<script lang="ts" module>
	/**
	 * `CmsCollection`: services, rooms, programmes, tours, projects. One list,
	 * rendered whole on its page and sliced (`limit`, `featured`, `tag`) on
	 * the home page through `scope="root"` or the list page's scope id.
	 */
	export * from '../../core/shapes/collection.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
	import { cms } from './cms-store.svelte.js';
	import { siteCurrency } from '../../core/site-currency.js';
	import {
		cmsCollection,
		collectionView,
		type CmsCollectionValue,
		type CollectionItem,
		type CollectionItemView
	} from '../../core/shapes/collection.js';

	type Props = {
		name: string;
		scope?: string;
		/** The full value, or a bare item list. */
		fallback?: Partial<CmsCollectionValue> | Partial<CollectionItem>[];
		value?: unknown;
		/** Render at most this many items. */
		limit?: number;
		/** Only featured items. */
		featured?: boolean;
		/** Only items carrying this tag. */
		tag?: string;
		children: Snippet<[CollectionItemView[]]>;
	};
	let { name, scope, fallback, value, limit, featured, tag, children }: Props = $props();
	// Prices are in the site's currency unless an item still carries its own.
	const currency = $derived(siteCurrency(cms.site));
</script>

<Structured
	schema={cmsCollection}
	{name}
	{scope}
	{fallback}
	{value}
	view={(v: CmsCollectionValue) => collectionView(v, { limit, featured, tag }, currency)}
	{children}
/>
