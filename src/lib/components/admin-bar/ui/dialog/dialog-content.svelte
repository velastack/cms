<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	import XIcon from "@lucide/svelte/icons/x";
	import type { Snippet } from "svelte";
	import { cn, type WithoutChildrenOrChild } from "$lib/components/admin-bar/utils.js";
	import DialogOverlay from "./dialog-overlay.svelte";
	import DialogPortal from "./dialog-portal.svelte";

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		showCloseButton = true,
		children,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		portalProps?: DialogPrimitive.PortalProps;
		showCloseButton?: boolean;
		children: Snippet;
	} = $props();
</script>

<!-- Portal targets `.vela-admin-bar` (not body) so the @scope-wrapped utilities apply. -->
<DialogPortal to=".vela-admin-bar" {...portalProps}>
	<DialogOverlay />
	<DialogPrimitive.Content
		bind:ref
		data-slot="dialog-content"
		class={cn(
			"vela:bg-bar-bg vela:text-bar-text vela:data-[state=open]:animate-in vela:data-[state=closed]:animate-out vela:data-[state=closed]:fade-out-0 vela:data-[state=open]:fade-in-0 vela:data-[state=closed]:zoom-out-95 vela:data-[state=open]:zoom-in-95 vela:fixed vela:top-1/2 vela:left-1/2 vela:z-50 vela:grid vela:w-[calc(100%-2rem)] vela:max-w-[30rem] vela:-translate-x-1/2 vela:-translate-y-1/2 vela:rounded-2xl vela:border vela:border-[var(--cms-bar-divider)] vela:shadow-[0_24px_60px_rgba(0,0,0,0.5),0_4px_12px_rgba(0,0,0,0.25)] vela:duration-200",
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		{#if showCloseButton}
			<DialogPrimitive.Close
				data-slot="dialog-close"
				class="vela:absolute vela:top-3 vela:right-3 vela:inline-flex vela:items-center vela:justify-center vela:w-7 vela:h-7 vela:rounded-full vela:text-bar-text-secondary vela:hover:text-bar-text vela:hover:bg-[var(--cms-bar-bg-hover)] vela:focus:outline-none vela:focus-visible:ring-2 vela:focus-visible:ring-[var(--cms-accent)] vela:cursor-pointer vela:disabled:pointer-events-none"
			>
				<XIcon class="vela:size-4" />
				<span class="vela:sr-only">Close</span>
			</DialogPrimitive.Close>
		{/if}
	</DialogPrimitive.Content>
</DialogPortal>
