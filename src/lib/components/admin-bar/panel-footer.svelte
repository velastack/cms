<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from './utils.js';

	type Props = {
		class?: string;
		children: Snippet;
	};
	let { class: className, children }: Props = $props();
</script>

<div
	class={cn(
		'vela:flex vela:items-center vela:justify-between vela:px-4 vela:py-2.5',
		'vela:border-t vela:border-[var(--cms-bar-divider)]',
		'vela:text-[12px] vela:text-bar-text-tertiary',
		className
	)}
>
	{@render children()}
</div>
