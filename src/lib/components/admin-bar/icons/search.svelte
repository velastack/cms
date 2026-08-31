<script lang="ts">
	// Lucide `search` icon path data (https://lucide.dev) — ISC License,
	// Copyright (c) Lucide Icons and Contributors. See ./types.ts.
	import Icon from './icon.svelte';
	import type { IconNode } from './types.js';

	const iconNode: IconNode = [
		['path', { d: 'm21 21-4.34-4.34' }],
		['circle', { cx: '11', cy: '11', r: '8' }]
	];
	let props = $props();
</script>

<Icon {iconNode} {...props} />
