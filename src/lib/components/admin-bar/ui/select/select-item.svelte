<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { cn, type WithoutChild } from '$lib/components/admin-bar/utils.js';
	import CheckIcon from '@lucide/svelte/icons/check';

	let {
		ref = $bindable(null),
		class: className,
		value,
		label,
		children: childrenProp,
		...restProps
	}: WithoutChild<SelectPrimitive.ItemProps> = $props();
</script>

<SelectPrimitive.Item
	bind:ref
	{value}
	data-slot="select-item"
	class={cn(
		'vela:relative vela:flex vela:w-full vela:items-center vela:gap-1.5 vela:rounded-sm vela:py-1 vela:pr-7 vela:pl-2 vela:text-xs vela:cursor-default vela:select-none vela:outline-hidden vela:text-bar-text vela:data-highlighted:bg-[var(--cms-bar-bg-hover)] vela:data-[disabled]:pointer-events-none vela:data-[disabled]:opacity-50',
		className
	)}
	{...restProps}
>
	{#snippet children({ selected, highlighted })}
		<span class="vela:absolute vela:end-2 vela:flex vela:size-3.5 vela:items-center vela:justify-center">
			{#if selected}
				<CheckIcon class="vela:size-3.5" />
			{/if}
		</span>
		{#if childrenProp}
			{@render childrenProp({ selected, highlighted })}
		{:else}
			{label || value}
		{/if}
	{/snippet}
</SelectPrimitive.Item>
