<script lang="ts">
	import { Menubar as MenubarPrimitive } from "bits-ui";
	import { cn } from "$lib/components/admin-bar/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: MenubarPrimitive.SeparatorProps = $props();
</script>

<MenubarPrimitive.Separator
	bind:ref
	data-slot="menubar-separator"
	class={cn("vela:bg-border vela:-mx-1 vela:my-1 vela:h-px", className)}
	{...restProps}
/>
