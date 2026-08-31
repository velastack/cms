<script lang="ts" module>
	import type { WithElementRef } from 'bits-ui';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { tv, type VariantProps } from 'tailwind-variants';

	export const buttonVariants = tv({
		base: 'vela:inline-flex vela:items-center vela:justify-center vela:gap-2 vela:whitespace-nowrap vela:rounded-md vela:text-sm vela:font-medium vela:transition-colors vela:focus-visible:outline-none vela:focus-visible:ring-1 vela:focus-visible:ring-ring vela:disabled:pointer-events-none vela:disabled:opacity-50 vela:cursor-pointer',
		variants: {
			variant: {
				default: 'vela:bg-primary vela:text-primary-foreground vela:hover:bg-primary/90',
				destructive:
					'vela:bg-destructive vela:text-destructive-foreground vela:hover:bg-destructive/90',
				outline:
					'vela:border vela:border-[var(--cms-bar-divider)] vela:bg-transparent vela:text-bar-text-secondary vela:hover:text-bar-text vela:hover:bg-[var(--cms-bar-bg-hover)]',
				'outline-destructive':
					'vela:border vela:border-[var(--cms-status-error-border)] vela:bg-transparent vela:text-[var(--cms-status-error-text-base)] vela:hover:text-[var(--cms-status-error-text-hover)] vela:hover:bg-[var(--cms-status-error-bg-hover)]',
				secondary: 'vela:bg-secondary vela:text-secondary-foreground vela:hover:bg-secondary/80',
				ghost:
					'vela:bg-transparent vela:text-bar-text-secondary vela:hover:text-bar-text vela:hover:bg-[var(--cms-bar-bg-hover)]',
				link: 'vela:text-primary vela:underline-offset-4 vela:hover:underline'
			},
			size: {
				default: 'vela:h-9 vela:px-4 vela:py-2',
				sm: 'vela:h-8 vela:rounded-md vela:px-3 vela:text-xs',
				lg: 'vela:h-10 vela:rounded-md vela:px-8',
				icon: 'vela:h-9 vela:w-9',
				pill: 'vela:h-7 vela:rounded-full vela:px-3 vela:text-[12px]',
				'pill-icon': 'vela:h-7 vela:w-7 vela:rounded-full',
				xs: 'vela:h-6 vela:rounded-md vela:px-2 vela:text-[11px]'
			}
		},
		defaultVariants: { variant: 'default', size: 'default' }
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
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
		type = 'button',
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a bind:this={ref} class={cn(buttonVariants({ variant, size }), className)} {href} {...restProps}>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
