<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '$lib/components/admin-bar/utils.js';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<SelectPrimitive.ScrollUpButtonProps> = $props();
</script>

<SelectPrimitive.ScrollUpButton
	bind:ref
	data-slot="select-scroll-up-button"
	class={cn(
		'vela:bg-bar-bg vela:z-10 vela:flex vela:cursor-default vela:items-center vela:justify-center vela:py-1 vela:top-0 vela:w-full',
		className
	)}
	{...restProps}
>
	<ChevronUpIcon class="vela:size-3.5" />
</SelectPrimitive.ScrollUpButton>
