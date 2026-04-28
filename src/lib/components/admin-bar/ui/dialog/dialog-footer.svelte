<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/components/admin-bar/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="dialog-footer"
	class={cn(
		"vela:flex vela:items-center vela:justify-between vela:gap-3 vela:px-6 vela:pt-3 vela:pb-5",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
