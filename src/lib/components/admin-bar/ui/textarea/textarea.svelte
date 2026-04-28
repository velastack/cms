<script lang="ts">
	import type { HTMLTextareaAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/components/admin-bar/utils.js";

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		...restProps
	}: WithElementRef<HTMLTextareaAttributes> = $props();
</script>

<textarea
	bind:this={ref}
	bind:value
	data-slot="textarea"
	class={cn(
		"vela:flex vela:min-h-[56px] vela:w-full vela:rounded-md vela:border vela:border-[var(--cms-bar-divider)] vela:bg-transparent vela:px-3 vela:py-2 vela:text-[13px] vela:text-bar-text vela:placeholder:text-bar-text-tertiary vela:font-sans vela:transition-colors vela:focus:outline-none vela:focus:border-[var(--cms-accent)] vela:disabled:opacity-60 vela:disabled:cursor-not-allowed vela:resize-y",
		className
	)}
	{...restProps}
></textarea>
