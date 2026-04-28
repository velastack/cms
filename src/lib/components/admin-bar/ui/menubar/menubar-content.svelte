<script lang="ts">
	import { Menubar as MenubarPrimitive } from "bits-ui";
	import { cn } from "$lib/components/admin-bar/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 8,
		alignOffset = -4,
		align = "start",
		side = "bottom",
		...restProps
	}: MenubarPrimitive.ContentProps = $props();
</script>

<MenubarPrimitive.Content
	bind:ref
	data-slot="menubar-content"
	{align}
	{alignOffset}
	{side}
	{sideOffset}
	class={cn(
		"vela:bg-popover vela:text-popover-foreground vela:ring-foreground/10 vela:data-[side=bottom]:slide-in-from-top-2 vela:data-[side=left]:slide-in-from-right-2 vela:data-[side=right]:slide-in-from-left-2 vela:data-[side=top]:slide-in-from-bottom-2 vela:data-open:animate-in vela:data-open:fade-in-0 vela:data-open:zoom-in-95 vela:z-50 vela:min-w-36 vela:origin-(--bits-menubar-content-transform-origin) vela:overflow-hidden vela:rounded-lg vela:p-1 vela:shadow-md vela:ring-1 vela:duration-100",
		className
	)}
	{...restProps}
/>
