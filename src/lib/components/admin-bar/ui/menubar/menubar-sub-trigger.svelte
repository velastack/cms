<script lang="ts">
	import { Menubar as MenubarPrimitive } from "bits-ui";
	import { cn, type WithoutChild } from "$lib/components/admin-bar/utils.js";
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	let {
		ref = $bindable(null),
		class: className,
		inset = undefined,
		children,
		...restProps
	}: WithoutChild<MenubarPrimitive.SubTriggerProps> & {
		inset?: boolean;
	} = $props();
</script>

<MenubarPrimitive.SubTrigger
	bind:ref
	data-slot="menubar-sub-trigger"
	data-inset={inset}
	class={cn(
		"vela:focus:bg-accent vela:focus:text-accent-foreground vela:data-open:bg-accent vela:data-open:text-accent-foreground vela:gap-1.5 vela:rounded-md vela:px-1.5 vela:py-1 vela:text-sm vela:data-inset:pl-7 vela:[&_svg:not([class*='size-'])]:size-4 vela:flex vela:cursor-default vela:items-center vela:outline-none vela:select-none",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<ChevronRightIcon class="cn-rtl-flip vela:ml-auto vela:size-4" />
</MenubarPrimitive.SubTrigger>
