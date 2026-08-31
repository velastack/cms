<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { cn } from '$lib/components/admin-bar/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: DialogPrimitive.OverlayProps = $props();
</script>

<DialogPrimitive.Overlay
	bind:ref
	data-slot="dialog-overlay"
	class={cn(
		'vela:data-[state=open]:animate-in vela:data-[state=closed]:animate-out vela:data-[state=closed]:fade-out-0 vela:data-[state=open]:fade-in-0 vela:fixed vela:inset-0 vela:z-50 vela:bg-black/55',
		className
	)}
	{...restProps}
/>
