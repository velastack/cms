<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import SelectPortal from './select-portal.svelte';
	import SelectScrollUpButton from './select-scroll-up-button.svelte';
	import SelectScrollDownButton from './select-scroll-down-button.svelte';
	import { cn, type WithoutChild } from '$lib/components/admin-bar/utils.js';
	import type { ComponentProps } from 'svelte';
	import type { WithoutChildrenOrChild } from '$lib/components/admin-bar/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		portalProps,
		children,
		preventScroll = true,
		...restProps
	}: WithoutChild<SelectPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SelectPortal>>;
	} = $props();
</script>

<SelectPortal {...portalProps}>
	<SelectPrimitive.Content
		bind:ref
		{sideOffset}
		{preventScroll}
		data-slot="select-content"
		class={cn(
			'vela:relative vela:isolate vela:z-50 vela:min-w-36 vela:overflow-x-hidden vela:overflow-y-auto vela:rounded-md vela:border vela:border-[var(--cms-bar-divider)] vela:bg-bar-bg vela:text-bar-text vela:shadow-[0_8px_24px_rgba(0,0,0,0.35)] vela:duration-100 vela:data-[state=open]:animate-in vela:data-[state=closed]:animate-out vela:data-[state=closed]:fade-out-0 vela:data-[state=open]:fade-in-0 vela:data-[state=closed]:zoom-out-95 vela:data-[state=open]:zoom-in-95',
			className
		)}
		{...restProps}
	>
		<SelectScrollUpButton />
		<SelectPrimitive.Viewport
			class={cn(
				'vela:h-(--bits-select-anchor-height) vela:w-full vela:min-w-(--bits-select-anchor-width) vela:scroll-my-1 vela:p-1'
			)}
		>
			{@render children?.()}
		</SelectPrimitive.Viewport>
		<SelectScrollDownButton />
	</SelectPrimitive.Content>
</SelectPortal>
