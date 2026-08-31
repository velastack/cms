<script lang="ts">
	import { Menubar as MenubarPrimitive } from 'bits-ui';
	import { cn } from '$lib/components/admin-bar/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: MenubarPrimitive.SubContentProps = $props();
</script>

<MenubarPrimitive.SubContent
	bind:ref
	data-slot="menubar-sub-content"
	class={cn(
		'vela:bg-popover vela:text-popover-foreground vela:data-open:animate-in vela:data-closed:animate-out vela:data-closed:fade-out-0 vela:data-open:fade-in-0 vela:data-closed:zoom-out-95 vela:data-open:zoom-in-95 vela:data-[side=bottom]:slide-in-from-top-2 vela:data-[side=left]:slide-in-from-right-2 vela:data-[side=right]:slide-in-from-left-2 vela:data-[side=top]:slide-in-from-bottom-2 vela:ring-foreground/10 vela:min-w-32 vela:rounded-lg vela:p-1 vela:shadow-lg vela:ring-1 vela:duration-100',
		className
	)}
	{...restProps}
/>
