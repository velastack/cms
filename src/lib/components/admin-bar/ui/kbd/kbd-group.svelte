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
	data-slot="kbd-group"
	class={cn('vela:inline-flex vela:items-center vela:gap-1', className)}
	{...restProps}
>
	{@render children?.()}
</kbd>
