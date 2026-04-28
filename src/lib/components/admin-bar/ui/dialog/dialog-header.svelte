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
	data-slot="dialog-header"
	class={cn("vela:flex vela:flex-col vela:gap-1 vela:px-6 vela:pt-5 vela:pb-4", className)}
	{...restProps}
>
	{@render children?.()}
</div>
