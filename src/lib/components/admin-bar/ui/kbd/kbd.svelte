<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/components/admin-bar/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<kbd
	bind:this={ref}
	data-slot="kbd"
	class={cn(
		'vela:pointer-events-none vela:inline-flex vela:h-[18px] vela:min-w-[18px] vela:items-center vela:justify-center vela:gap-1 vela:rounded vela:px-1 vela:select-none',
		'vela:bg-[var(--cms-bar-bg-hover)] vela:text-bar-text-tertiary',
		'vela:border vela:border-[var(--cms-bar-divider)]',
		'vela:font-mono vela:text-[10px] vela:font-medium vela:tracking-normal',
		"vela:[&_svg:not([class*='size-'])]:size-3",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</kbd>
