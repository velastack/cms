<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from './utils.js';

	type Variant = 'clean' | 'warn' | 'edit';

	type Props = {
		variant: Variant;
		onclick?: () => void;
		class?: string;
		children: Snippet;
	};
	let { variant, onclick, class: className, children }: Props = $props();

	const variantClass: Record<Variant, string> = {
		clean: 'vela:text-[var(--cms-status-clean-text)]',
		warn: 'vela:bg-[var(--cms-status-warn-bg)] vela:text-[var(--cms-status-warn-text)] vela:animate-bar-pulse',
		edit: 'vela:bg-[var(--cms-status-edit-bg)] vela:text-[var(--cms-status-edit-text)]'
	};
	const dotClass: Record<Variant, string> = {
		clean: 'vela:bg-[var(--cms-status-clean-dot)]',
		warn: 'vela:bg-[var(--cms-status-warn-dot)]',
		edit: 'vela:bg-[var(--cms-status-edit-dot)]'
	};

	const baseClass =
		'vela:inline-flex vela:items-center vela:gap-1.5 vela:h-7 vela:pl-2.5 vela:pr-3 vela:rounded-full vela:text-[13px]';
</script>

{#if onclick}
	<button
		type="button"
		{onclick}
		class={cn(
			baseClass,
			variantClass[variant],
			'vela:cursor-pointer vela:hover:bg-[var(--cms-status-warn-bg-hover)] vela:focus:outline-none',
			className
		)}
	>
		<span class={cn('vela:w-1.5 vela:h-1.5 vela:rounded-full', dotClass[variant])}></span>
		{@render children()}
	</button>
{:else}
	<div class={cn(baseClass, variantClass[variant], className)}>
		<span class={cn('vela:w-1.5 vela:h-1.5 vela:rounded-full', dotClass[variant])}></span>
		{@render children()}
	</div>
{/if}
