<script lang="ts">
	import { cn, type WithElementRef } from '$lib/components/admin-bar/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {} = $props();
</script>

<div
	bind:this={ref}
	data-slot="select-label"
	class={cn('vela:text-bar-text-secondary vela:px-2 vela:py-1 vela:text-[11px]', className)}
	{...restProps}
>
	{@render children?.()}
</div>
