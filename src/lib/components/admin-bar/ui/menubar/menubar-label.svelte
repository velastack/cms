<script lang="ts">
	import { cn } from "$lib/components/admin-bar/utils.js";
	import { type WithElementRef } from "bits-ui";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		inset,
		children,
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		inset?: boolean;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="menubar-label"
	data-inset={inset}
	class={cn("vela:px-1.5 vela:py-1 vela:text-sm vela:font-medium vela:data-inset:pl-7", className)}
	{...restProps}
>
	{@render children?.()}
</div>
