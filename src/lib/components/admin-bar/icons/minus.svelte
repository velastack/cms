<script lang="ts">
	// Lucide `minus` icon path data (https://lucide.dev) — ISC License,
	// Copyright (c) Lucide Icons and Contributors. See ./types.ts.
	import Icon from './icon.svelte';
	import type { IconNode } from './types.js';

	const iconNode: IconNode = [['path', { d: 'M5 12h14' }]];
	let props = $props();
</script>

<Icon {iconNode} {...props} />
