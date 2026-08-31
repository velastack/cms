<script lang="ts">
	/**
	 * Minimal SVG renderer for the bar's icon set.
	 *
	 * The icons are Lucide path data, vendored so the package doesn't carry an
	 * icon dependency for the 25 glyphs the bar actually uses. Sibling modules
	 * hold one `iconNode` each and render through this component.
	 *
	 * Icon path data from Lucide (https://lucide.dev) — ISC License,
	 * Copyright (c) Lucide Icons and Contributors.
	 */
	import type { SVGAttributes } from 'svelte/elements';
	import type { IconNode } from './types.js';

	type Props = SVGAttributes<SVGSVGElement> & {
		iconNode: IconNode;
		size?: number | string;
		color?: string;
		strokeWidth?: number | string;
	};

	let { iconNode, size = 24, color = 'currentColor', strokeWidth = 2, ...rest }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	fill="none"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	{...rest}
	width={size}
	height={size}
	stroke={color}
	stroke-width={strokeWidth}
>
	{#each iconNode as [tag, attrs] (tag + JSON.stringify(attrs))}
		<svelte:element this={tag} {...attrs} />
	{/each}
</svg>
