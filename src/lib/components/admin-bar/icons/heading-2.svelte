<script lang="ts">
	// Lucide `heading-2` icon path data (https://lucide.dev) — ISC License,
	// Copyright (c) Lucide Icons and Contributors. See ./types.ts.
	import Icon from './icon.svelte';
	import type { IconNode } from './types.js';

	const iconNode: IconNode = [
		['path', { d: 'M4 12h8' }],
		['path', { d: 'M4 18V6' }],
		['path', { d: 'M12 18V6' }],
		['path', { d: 'M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1' }]
	];
	let props = $props();
</script>

<Icon {iconNode} {...props} />
