<script lang="ts">
	import { Label as LabelPrimitive } from "bits-ui";
	import { cn } from "$lib/components/admin-bar/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: LabelPrimitive.RootProps = $props();
</script>

<LabelPrimitive.Root
	bind:ref
	data-slot="label"
	class={cn(
		"vela:flex vela:items-center vela:gap-2 vela:text-[12px] vela:text-bar-text-secondary vela:select-none",
		className
	)}
	{...restProps}
/>
