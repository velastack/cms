<script lang="ts">
	import { Menubar as MenubarPrimitive } from 'bits-ui';
	import { cn } from '$lib/components/admin-bar/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: MenubarPrimitive.RootProps = $props();
</script>

<MenubarPrimitive.Root
	bind:ref
	data-slot="menubar"
	class={cn(
		'vela:h-8 vela:gap-0.5 vela:rounded-lg vela:border vela:p-[3px] vela:flex vela:items-center',
		className
	)}
	{...restProps}
/>
