<script lang="ts">
	import { Dialog as SheetPrimitive } from 'bits-ui';
	import { cn } from '../../utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: SheetPrimitive.OverlayProps = $props();
</script>

<SheetPrimitive.Overlay
	bind:ref
	data-slot="sheet-overlay"
	class={cn(
		'vela:fixed vela:inset-0 vela:z-[9998] vela:bg-black/50 vela:data-[state=open]:animate-in vela:data-[state=closed]:animate-out vela:data-[state=closed]:fade-out-0 vela:data-[state=open]:fade-in-0',
		className
	)}
	{...restProps}
/>
