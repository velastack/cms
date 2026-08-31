<script lang="ts">
	// Lucide `heading-3` icon path data (https://lucide.dev) — ISC License,
	// Copyright (c) Lucide Icons and Contributors. See ./types.ts.
	import Icon from './icon.svelte';
	import type { IconNode } from './types.js';

	const iconNode: IconNode = [
		['path', { d: 'M4 12h8' }],
		['path', { d: 'M4 18V6' }],
		['path', { d: 'M12 18V6' }],
		['path', { d: 'M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2' }],
		['path', { d: 'M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2' }]
	];
	let props = $props();
</script>

<Icon {iconNode} {...props} />
