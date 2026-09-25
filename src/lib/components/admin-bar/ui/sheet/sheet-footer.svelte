<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '../../utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="sheet-footer"
	class={cn(
		'vela:mt-auto vela:flex vela:items-center vela:justify-end vela:gap-1.5 vela:px-4 vela:py-2.5 vela:border-t vela:border-[var(--cms-bar-divider)]',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
