<script lang="ts">
	// Lucide `loader-circle` icon path data (https://lucide.dev) — ISC License,
	// Copyright (c) Lucide Icons and Contributors. See ./types.ts.
	import Icon from './icon.svelte';
	import type { IconNode } from './types.js';

	const iconNode: IconNode = [['path', { d: 'M21 12a9 9 0 1 1-6.219-8.56' }]];
	let props = $props();
</script>

<Icon {iconNode} {...props} />
