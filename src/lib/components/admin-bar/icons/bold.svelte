<script lang="ts">
	// Lucide `bold` icon path data (https://lucide.dev) — ISC License,
	// Copyright (c) Lucide Icons and Contributors. See ./types.ts.
	import Icon from './icon.svelte';
	import type { IconNode } from './types.js';

	const iconNode: IconNode = [
		['path', { d: 'M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8' }]
	];
	let props = $props();
</script>

<Icon {iconNode} {...props} />
