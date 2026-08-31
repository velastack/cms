<script lang="ts">
	// Lucide `link-2-off` icon path data (https://lucide.dev) — ISC License,
	// Copyright (c) Lucide Icons and Contributors. See ./types.ts.
	import Icon from './icon.svelte';
	import type { IconNode } from './types.js';

	const iconNode: IconNode = [
		['path', { d: 'M9 17H7A5 5 0 0 1 7 7' }],
		['path', { d: 'M15 7h2a5 5 0 0 1 4 8' }],
		['line', { x1: '8', x2: '12', y1: '12', y2: '12' }],
		['line', { x1: '2', x2: '22', y1: '2', y2: '22' }]
	];
	let props = $props();
</script>

<Icon {iconNode} {...props} />
