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
	data-slot="sheet-header"
	class={cn('vela:flex vela:flex-col vela:gap-1 vela:px-4 vela:pt-3.5 vela:pb-3', className)}
	{...restProps}
>
	{@render children?.()}
</div>
