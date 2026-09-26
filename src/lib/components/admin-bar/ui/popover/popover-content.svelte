<script lang="ts">
	import { Popover as PopoverPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '../../utils.js';
	import type { Snippet } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 6,
		align = 'start',
		portalProps,
		children,
		...restProps
	}: WithoutChildrenOrChild<PopoverPrimitive.ContentProps> & {
		portalProps?: PopoverPrimitive.PortalProps;
		children?: Snippet;
	} = $props();
</script>

<!-- Portal targets `.vela-admin-bar` (not body) so the @scope-wrapped utilities apply. -->
<PopoverPrimitive.Portal to=".vela-admin-bar" {...portalProps}>
	<PopoverPrimitive.Content
		bind:ref
		data-slot="popover-content"
		{sideOffset}
		{align}
		class={cn(
			'vela:z-[9999] vela:w-80 vela:rounded-xl vela:border vela:border-[var(--cms-bar-divider)] vela:bg-bar-bg vela:text-bar-text vela:shadow-[0_12px_32px_rgba(0,0,0,0.45)] vela:outline-hidden vela:data-[state=open]:animate-in vela:data-[state=closed]:animate-out vela:data-[state=closed]:fade-out-0 vela:data-[state=open]:fade-in-0 vela:data-[state=closed]:zoom-out-95 vela:data-[state=open]:zoom-in-95 vela:duration-150',
			className
		)}
		{...restProps}
	>
		{@render children?.()}
	</PopoverPrimitive.Content>
</PopoverPrimitive.Portal>
