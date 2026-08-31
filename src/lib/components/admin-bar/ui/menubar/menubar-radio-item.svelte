<script lang="ts">
	import { Menubar as MenubarPrimitive } from 'bits-ui';
	import { cn, type WithoutChild } from '$lib/components/admin-bar/utils.js';
	import CheckIcon from '@lucide/svelte/icons/check';

	let {
		ref = $bindable(null),
		class: className,
		inset,
		children: childrenProp,
		...restProps
	}: WithoutChild<MenubarPrimitive.RadioItemProps> & {
		inset?: boolean;
	} = $props();
</script>

<MenubarPrimitive.RadioItem
	bind:ref
	data-slot="menubar-radio-item"
	data-inset={inset}
	class={cn(
		"vela:focus:bg-accent vela:focus:text-accent-foreground vela:focus:**:text-accent-foreground vela:gap-1.5 vela:rounded-md vela:py-1 vela:pr-1.5 vela:pl-7 vela:text-sm vela:data-disabled:opacity-50 vela:data-inset:pl-7 vela:[&_svg:not([class*='size-'])]:size-4 vela:relative vela:flex vela:cursor-default vela:items-center vela:outline-hidden vela:select-none vela:data-disabled:pointer-events-none vela:[&_svg]:pointer-events-none vela:[&_svg]:shrink-0",
		className
	)}
	{...restProps}
>
	{#snippet children({ checked })}
		<span
			class="vela:left-1.5 vela:size-4 vela:[&_svg:not([class*='size-'])]:size-4 vela:pointer-events-none vela:absolute vela:flex vela:items-center vela:justify-center"
		>
			{#if checked}
				<CheckIcon />
			{/if}
		</span>
		{@render childrenProp?.({ checked })}
	{/snippet}
</MenubarPrimitive.RadioItem>
