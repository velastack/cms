<script lang="ts">
	import { Menubar as MenubarPrimitive } from 'bits-ui';
	import { cn } from '$lib/components/admin-bar/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: MenubarPrimitive.TriggerProps = $props();
</script>

<MenubarPrimitive.Trigger
	bind:ref
	data-slot="menubar-trigger"
	class={cn(
		'vela:hover:bg-muted vela:aria-expanded:bg-muted vela:rounded-sm vela:px-1.5 vela:py-[2px] vela:text-sm vela:font-medium vela:flex vela:items-center vela:outline-hidden vela:select-none',
		className
	)}
	{...restProps}
/>
