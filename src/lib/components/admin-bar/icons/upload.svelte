<script lang="ts">
	// Lucide `upload` icon path data (https://lucide.dev) — ISC License,
	// Copyright (c) Lucide Icons and Contributors. See ./types.ts.
	import Icon from './icon.svelte';
	import type { IconNode } from './types.js';

	const iconNode: IconNode = [
		['path', { d: 'M12 3v12' }],
		['path', { d: 'm17 8-5-5-5 5' }],
		['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }]
	];
	let props = $props();
</script>

<Icon {iconNode} {...props} />
