<script lang="ts">
	import { Checkbox as CheckboxPrimitive } from 'bits-ui';
	import CheckIcon from '../../icons/check.svelte';
	import MinusIcon from '../../icons/minus.svelte';
	import { cn, type WithoutChildrenOrChild } from '../../utils.js';

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		indeterminate = $bindable(false),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<CheckboxPrimitive.RootProps> = $props();
</script>

<CheckboxPrimitive.Root
	bind:ref
	bind:checked
	bind:indeterminate
	data-slot="checkbox"
	class={cn(
		'vela:peer vela:size-4 vela:shrink-0 vela:rounded-[4px] vela:border vela:border-[var(--cms-bar-divider)] vela:bg-transparent vela:cursor-pointer vela:transition-colors vela:focus-visible:outline-none vela:focus-visible:ring-2 vela:focus-visible:ring-[var(--cms-accent)] vela:disabled:cursor-not-allowed vela:disabled:opacity-50 vela:data-[state=checked]:bg-[var(--cms-accent)] vela:data-[state=checked]:border-[var(--cms-accent)] vela:data-[state=checked]:text-white vela:data-[state=indeterminate]:bg-[var(--cms-accent)] vela:data-[state=indeterminate]:text-white',
		className
	)}
	{...restProps}
>
	{#snippet children({ checked, indeterminate })}
		<span class="vela:flex vela:size-full vela:items-center vela:justify-center vela:text-current">
			{#if indeterminate}
				<MinusIcon class="vela:size-3" />
			{:else if checked}
				<CheckIcon class="vela:size-3" />
			{/if}
		</span>
	{/snippet}
</CheckboxPrimitive.Root>
