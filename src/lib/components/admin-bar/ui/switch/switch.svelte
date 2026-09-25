<script lang="ts">
	import { Switch as SwitchPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '../../utils.js';

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<SwitchPrimitive.RootProps> = $props();
</script>

<SwitchPrimitive.Root
	bind:ref
	bind:checked
	data-slot="switch"
	class={cn(
		'vela:peer vela:inline-flex vela:h-5 vela:w-9 vela:shrink-0 vela:items-center vela:rounded-full vela:border vela:border-transparent vela:transition-colors vela:cursor-pointer vela:focus-visible:outline-none vela:focus-visible:ring-2 vela:focus-visible:ring-[var(--cms-accent)] vela:disabled:cursor-not-allowed vela:disabled:opacity-50 vela:data-[state=checked]:bg-[var(--cms-accent)] vela:data-[state=unchecked]:bg-[var(--cms-bar-divider)]',
		className
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		data-slot="switch-thumb"
		class="vela:pointer-events-none vela:block vela:size-4 vela:rounded-full vela:bg-white vela:shadow vela:transition-transform vela:data-[state=checked]:translate-x-4 vela:data-[state=unchecked]:translate-x-0.5"
	/>
</SwitchPrimitive.Root>
