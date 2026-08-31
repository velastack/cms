<script lang="ts">
	// Lucide `check` icon path data (https://lucide.dev) — ISC License,
	// Copyright (c) Lucide Icons and Contributors. See ./types.ts.
	import Icon from './icon.svelte';
	import type { IconNode } from './types.js';

	const iconNode: IconNode = [['path', { d: 'M20 6 9 17l-5-5' }]];
	let props = $props();
</script>

<Icon {iconNode} {...props} />
