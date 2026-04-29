<script lang="ts" module>
	import type { WithElementRef } from 'bits-ui';
	import type { HTMLAnchorAttributes, HTMLAttributes } from 'svelte/elements';
	import { tv, type VariantProps } from 'tailwind-variants';

	export const badgeVariants = tv({
		base: 'vela:inline-flex vela:items-center vela:justify-center vela:gap-1 vela:rounded-md vela:px-2 vela:py-0.5 vela:text-[11px] vela:font-medium vela:tracking-tight vela:whitespace-nowrap',
		variants: {
			variant: {
				default:
					'vela:bg-[var(--cms-bar-bg-hover)] vela:text-bar-text-secondary',
				warn:
					'vela:bg-[var(--cms-status-warn-bg)] vela:text-[var(--cms-status-warn-text)]',
				success:
					'vela:bg-[var(--cms-status-success-bg)] vela:text-[var(--cms-status-success-text)]',
				edit:
					'vela:bg-[var(--cms-status-edit-bg)] vela:text-[var(--cms-status-edit-text)]',
				destructive:
					'vela:bg-[var(--cms-status-error-bg)] vela:text-[var(--cms-status-error-text)]'
			},
			size: {
				default: 'vela:px-2 vela:py-0.5 vela:text-[11px]',
				sm: 'vela:px-1.5 vela:py-0.5 vela:text-[10px] vela:font-semibold vela:uppercase vela:tracking-wider'
			}
		},
		defaultVariants: { variant: 'default', size: 'default' }
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
	export type BadgeSize = VariantProps<typeof badgeVariants>['size'];

	export type BadgeProps = WithElementRef<HTMLAttributes<HTMLSpanElement>> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: BadgeVariant;
			size?: BadgeSize;
		};
</script>

<script lang="ts">
	import { cn } from '../../utils.js';

	let {
		class: className,
		variant = 'default',
		size = 'default',
		ref = $bindable(null),
		href = undefined,
		children,
		...restProps
	}: BadgeProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		class={cn(badgeVariants({ variant, size }), className)}
		{href}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<span
		bind:this={ref}
		class={cn(badgeVariants({ variant, size }), className)}
		{...restProps}
	>
		{@render children?.()}
	</span>
{/if}
