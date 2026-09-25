<script lang="ts" module>
	import { variants, type VariantProps } from '../../variants.js';

	export const sheetVariants = variants({
		base: 'vela:fixed vela:z-[9999] vela:flex vela:flex-col vela:gap-4 vela:bg-bar-bg vela:text-bar-text vela:shadow-[0_12px_32px_rgba(0,0,0,0.45)] vela:transition vela:ease-in-out vela:data-[state=open]:animate-in vela:data-[state=closed]:animate-out vela:data-[state=closed]:duration-200 vela:data-[state=open]:duration-300',
		variants: {
			side: {
				top: 'vela:inset-x-0 vela:top-0 vela:border-b vela:border-[var(--cms-bar-divider)] vela:data-[state=closed]:slide-out-to-top vela:data-[state=open]:slide-in-from-top',
				bottom:
					'vela:inset-x-0 vela:bottom-0 vela:max-h-[85vh] vela:rounded-t-2xl vela:border-t vela:border-[var(--cms-bar-divider)] vela:data-[state=closed]:slide-out-to-bottom vela:data-[state=open]:slide-in-from-bottom',
				left: 'vela:inset-y-0 vela:left-0 vela:h-full vela:w-3/4 vela:max-w-sm vela:border-r vela:border-[var(--cms-bar-divider)] vela:data-[state=closed]:slide-out-to-left vela:data-[state=open]:slide-in-from-left',
				right:
					'vela:inset-y-0 vela:right-0 vela:h-full vela:w-3/4 vela:max-w-sm vela:border-l vela:border-[var(--cms-bar-divider)] vela:data-[state=closed]:slide-out-to-right vela:data-[state=open]:slide-in-from-right'
			}
		},
		defaultVariants: { side: 'bottom' }
	});

	export type Side = VariantProps<typeof sheetVariants>['side'];
</script>

<script lang="ts">
	import { Dialog as SheetPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import XIcon from '../../icons/x.svelte';
	import { cn, type WithoutChildrenOrChild } from '../../utils.js';
	import SheetOverlay from './sheet-overlay.svelte';

	let {
		ref = $bindable(null),
		class: className,
		side = 'bottom',
		portalProps,
		showCloseButton = true,
		children,
		...restProps
	}: WithoutChildrenOrChild<SheetPrimitive.ContentProps> & {
		portalProps?: SheetPrimitive.PortalProps;
		side?: Side;
		showCloseButton?: boolean;
		children: Snippet;
	} = $props();
</script>

<SheetPrimitive.Portal to=".vela-admin-bar" {...portalProps}>
	<SheetOverlay />
	<SheetPrimitive.Content
		bind:ref
		data-slot="sheet-content"
		class={cn(sheetVariants({ side }), className)}
		{...restProps}
	>
		{@render children?.()}
		{#if showCloseButton}
			<SheetPrimitive.Close
				data-slot="sheet-close"
				class="vela:absolute vela:top-3 vela:right-3 vela:inline-flex vela:items-center vela:justify-center vela:w-7 vela:h-7 vela:rounded-full vela:text-bar-text-secondary vela:hover:text-bar-text vela:hover:bg-[var(--cms-bar-bg-hover)] vela:focus:outline-none vela:focus-visible:ring-2 vela:focus-visible:ring-[var(--cms-accent)] vela:cursor-pointer"
			>
				<XIcon class="vela:size-4" />
				<span class="vela:sr-only">Close</span>
			</SheetPrimitive.Close>
		{/if}
	</SheetPrimitive.Content>
</SheetPrimitive.Portal>
