<script lang="ts">
	import type { HTMLInputAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/components/admin-bar/utils.js";

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		type = "text",
		...restProps
	}: WithElementRef<HTMLInputAttributes> = $props();
</script>

<input
	bind:this={ref}
	bind:value
	{type}
	data-slot="input"
	class={cn(
		"vela:flex vela:h-9 vela:w-full vela:rounded-md vela:border vela:border-[var(--cms-bar-divider)] vela:bg-transparent vela:px-3 vela:py-1 vela:text-[13px] vela:text-bar-text vela:placeholder:text-bar-text-tertiary vela:transition-colors vela:focus:outline-none vela:focus:border-[var(--cms-accent)] vela:disabled:opacity-60 vela:disabled:cursor-not-allowed",
		className
	)}
	{...restProps}
/>
