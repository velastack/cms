<script lang="ts">
	// Lucide `chevron-up` icon path data (https://lucide.dev) — ISC License,
	// Copyright (c) Lucide Icons and Contributors. See ./types.ts.
	import Icon from './icon.svelte';
	import type { IconNode } from './types.js';

	const iconNode: IconNode = [['path', { d: 'm18 15-6-6-6 6' }]];
	let props = $props();
</script>

<Icon {iconNode} {...props} />
