<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { cn, type WithoutChild } from '$lib/components/admin-bar/utils.js';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';

	let {
		ref = $bindable(null),
		class: className,
		children,
		size = 'default',
		...restProps
	}: WithoutChild<SelectPrimitive.TriggerProps> & {
		size?: 'sm' | 'default';
	} = $props();
</script>

<SelectPrimitive.Trigger
	bind:ref
	data-slot="select-trigger"
	data-size={size}
	class={cn(
		'vela:flex vela:w-fit vela:items-center vela:justify-between vela:gap-1.5 vela:whitespace-nowrap vela:rounded-md vela:border vela:border-[var(--cms-bar-divider)] vela:bg-transparent vela:py-1 vela:pr-2 vela:pl-2.5 vela:text-xs vela:text-bar-text vela:transition-colors vela:select-none vela:outline-none vela:cursor-pointer vela:hover:bg-[var(--cms-bar-bg-hover)] vela:focus-visible:ring-2 vela:focus-visible:ring-[var(--cms-accent)] vela:disabled:cursor-not-allowed vela:disabled:opacity-50 vela:data-[size=default]:h-7 vela:data-[size=sm]:h-6 vela:data-placeholder:text-bar-text-tertiary',
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<ChevronDownIcon
		class="vela:size-3.5 vela:text-bar-text-secondary vela:pointer-events-none vela:shrink-0"
	/>
</SelectPrimitive.Trigger>
