<script lang="ts">
	import { Separator as SeparatorPrimitive } from 'bits-ui';
	import { cn } from '$lib/components/admin-bar/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		'data-slot': dataSlot = 'separator',
		...restProps
	}: SeparatorPrimitive.RootProps = $props();
</script>

<SeparatorPrimitive.Root
	bind:ref
	data-slot={dataSlot}
	class={cn(
		'vela:bg-[var(--cms-bar-divider)] vela:shrink-0 vela:data-[orientation=horizontal]:h-px vela:data-[orientation=horizontal]:w-full vela:data-[orientation=vertical]:w-px vela:data-[orientation=vertical]:h-full',
		className
	)}
	{...restProps}
/>
