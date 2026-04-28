<script lang="ts">
	import { cn } from "$lib/components/admin-bar/utils.js";
	import { Menubar as MenubarPrimitive } from "bits-ui";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		inset,
		class: className,
		...restProps
	}: ComponentProps<typeof MenubarPrimitive.GroupHeading> & {
		inset?: boolean;
	} = $props();
</script>

<MenubarPrimitive.GroupHeading
	bind:ref
	data-slot="menubar-group-heading"
	data-inset={inset}
	class={cn("vela:px-2 vela:py-1.5 vela:text-sm vela:font-medium vela:data-[inset]:ps-8", className)}
	{...restProps}
/>
