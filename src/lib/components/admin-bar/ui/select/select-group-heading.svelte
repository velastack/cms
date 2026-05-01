<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { cn } from '$lib/components/admin-bar/utils.js';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: ComponentProps<typeof SelectPrimitive.GroupHeading> = $props();
</script>

<SelectPrimitive.GroupHeading
	bind:ref
	data-slot="select-group-heading"
	class={cn('vela:text-bar-text-secondary vela:px-2 vela:py-1 vela:text-[11px]', className)}
	{...restProps}
>
	{@render children?.()}
</SelectPrimitive.GroupHeading>
