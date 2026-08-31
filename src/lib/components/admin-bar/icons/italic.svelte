<script lang="ts">
	// Lucide `italic` icon path data (https://lucide.dev) — ISC License,
	// Copyright (c) Lucide Icons and Contributors. See ./types.ts.
	import Icon from './icon.svelte';
	import type { IconNode } from './types.js';

	const iconNode: IconNode = [
		['line', { x1: '19', x2: '10', y1: '4', y2: '4' }],
		['line', { x1: '14', x2: '5', y1: '20', y2: '20' }],
		['line', { x1: '15', x2: '9', y1: '4', y2: '20' }]
	];
	let props = $props();
</script>

<Icon {iconNode} {...props} />
