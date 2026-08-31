<script lang="ts">
	// Lucide `file` icon path data (https://lucide.dev) — ISC License,
	// Copyright (c) Lucide Icons and Contributors. See ./types.ts.
	import Icon from './icon.svelte';
	import type { IconNode } from './types.js';

	const iconNode: IconNode = [
		[
			'path',
			{
				d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z'
			}
		],
		['path', { d: 'M14 2v5a1 1 0 0 0 1 1h5' }]
	];
	let props = $props();
</script>

<Icon {iconNode} {...props} />
