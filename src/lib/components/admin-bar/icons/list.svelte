<script lang="ts">
	// Lucide `list` icon path data (https://lucide.dev) — ISC License,
	// Copyright (c) Lucide Icons and Contributors. See ./types.ts.
	import Icon from './icon.svelte';
	import type { IconNode } from './types.js';

	const iconNode: IconNode = [
		['path', { d: 'M3 5h.01' }],
		['path', { d: 'M3 12h.01' }],
		['path', { d: 'M3 19h.01' }],
		['path', { d: 'M8 5h13' }],
		['path', { d: 'M8 12h13' }],
		['path', { d: 'M8 19h13' }]
	];
	let props = $props();
</script>

<Icon {iconNode} {...props} />
