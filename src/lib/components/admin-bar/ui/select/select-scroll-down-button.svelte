<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '$lib/components/admin-bar/utils.js';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<SelectPrimitive.ScrollDownButtonProps> = $props();
</script>

<SelectPrimitive.ScrollDownButton
	bind:ref
	data-slot="select-scroll-down-button"
	class={cn(
		'vela:bg-bar-bg vela:z-10 vela:flex vela:cursor-default vela:items-center vela:justify-center vela:py-1 vela:bottom-0 vela:w-full',
		className
	)}
	{...restProps}
>
	<ChevronDownIcon class="vela:size-3.5" />
</SelectPrimitive.ScrollDownButton>
