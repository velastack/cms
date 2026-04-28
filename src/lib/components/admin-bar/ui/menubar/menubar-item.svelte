<script lang="ts">
	import { Menubar as MenubarPrimitive } from "bits-ui";
	import { cn } from "$lib/components/admin-bar/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		inset = undefined,
		variant = "default",
		...restProps
	}: MenubarPrimitive.ItemProps & {
		inset?: boolean;
		variant?: "default" | "destructive";
	} = $props();
</script>

<MenubarPrimitive.Item
	bind:ref
	data-slot="menubar-item"
	data-inset={inset}
	data-variant={variant}
	class={cn("vela:focus:bg-accent vela:focus:text-accent-foreground vela:data-[variant=destructive]:text-destructive vela:data-[variant=destructive]:focus:bg-destructive/10 vela:dark:data-[variant=destructive]:focus:bg-destructive/20 vela:data-[variant=destructive]:focus:text-destructive vela:data-[variant=destructive]:*:[svg]:text-destructive! vela:not-data-[variant=destructive]:focus:**:text-accent-foreground vela:gap-1.5 vela:rounded-md vela:px-1.5 vela:py-1 vela:text-sm vela:data-disabled:opacity-50 vela:data-inset:pl-7 vela:[&_svg:not([class*='size-'])]:size-4 vela:group/menubar-item vela:flex vela:items-center", className)}
	{...restProps}
/>
