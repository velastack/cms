<script lang="ts">
	// Lucide `trash-2` icon path data (https://lucide.dev) — ISC License,
	// Copyright (c) Lucide Icons and Contributors. See ./types.ts.
	import Icon from './icon.svelte';
	import type { IconNode } from './types.js';

	const iconNode: IconNode = [
		['path', { d: 'M10 11v6' }],
		['path', { d: 'M14 11v6' }],
		['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }],
		['path', { d: 'M3 6h18' }],
		['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }]
	];
	let props = $props();
</script>

<Icon {iconNode} {...props} />
