<script lang="ts">
	import type { Separator as SeparatorPrimitive } from 'bits-ui';
	import { Separator } from '$lib/components/admin-bar/ui/separator/index.js';
	import { cn } from '$lib/components/admin-bar/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: SeparatorPrimitive.RootProps = $props();
</script>

<Separator
	bind:ref
	data-slot="select-separator"
	class={cn(
		'vela:bg-[var(--cms-bar-divider)] vela:-mx-1 vela:my-1 vela:h-px vela:pointer-events-none',
		className
	)}
	{...restProps}
/>
