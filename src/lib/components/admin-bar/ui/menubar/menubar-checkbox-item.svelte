<script lang="ts">
	import { Menubar as MenubarPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "$lib/components/admin-bar/utils.js";
	import type { Snippet } from "svelte";
	import MinusIcon from '@lucide/svelte/icons/minus';
	import CheckIcon from '@lucide/svelte/icons/check';

	let {
		ref = $bindable(null),
		class: className,
		checked = $bindable(false),
		indeterminate = $bindable(false),
		inset,
		children: childrenProp,
		...restProps
	}: WithoutChildrenOrChild<MenubarPrimitive.CheckboxItemProps> & {
		inset?: boolean;
		children?: Snippet;
	} = $props();
</script>

<MenubarPrimitive.CheckboxItem
	bind:ref
	bind:checked
	bind:indeterminate
	data-slot="menubar-checkbox-item"
	data-inset={inset}
	class={cn(
		"vela:focus:bg-accent vela:focus:text-accent-foreground vela:focus:**:text-accent-foreground vela:gap-1.5 vela:rounded-md vela:py-1 vela:pr-1.5 vela:pl-7 vela:text-sm vela:data-inset:pl-7 vela:relative vela:flex vela:cursor-default vela:items-center vela:outline-hidden vela:select-none vela:data-disabled:pointer-events-none vela:data-disabled:opacity-50 vela:[&_svg]:pointer-events-none vela:[&_svg]:shrink-0",
		className
	)}
	{...restProps}
>
	{#snippet children({ checked: checked, indeterminate: indeterminate })}
		<span
			class="vela:left-1.5 vela:size-4 vela:[&_svg:not([class*='size-'])]:size-4 vela:pointer-events-none vela:absolute vela:flex vela:items-center vela:justify-center"
		>
			{#if indeterminate}
				<MinusIcon  />
			{:else if checked}
				<CheckIcon  />
			{/if}
		</span>
		{@render childrenProp?.()}
	{/snippet}
</MenubarPrimitive.CheckboxItem>
