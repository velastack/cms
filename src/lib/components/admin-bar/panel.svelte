<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from './utils.js';

	type Props = {
		ariaLabel: string;
		onClose: () => void;
		class?: string;
		children: Snippet;
	};
	let { ariaLabel, onClose, class: className, children }: Props = $props();

	// Escape closes the panel. Each panel previously duplicated this effect; it
	// lives here now so callers don't have to remember.
	$effect(() => {
		const onKeydown = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			e.preventDefault();
			e.stopPropagation();
			onClose();
		};
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});
</script>

<div
	role="dialog"
	aria-label={ariaLabel}
	class={cn(
		'vela:fixed vela:top-[72px] vela:left-1/2 vela:-translate-x-1/2 vela:z-[9998]',
		'vela:w-full vela:max-w-[560px] vela:mx-4 vela:sm:mx-auto',
		'vela:flex vela:flex-col',
		'vela:max-h-[calc(100vh-6rem)]',
		'vela:rounded-xl vela:bg-bar-bg vela:text-bar-text',
		'vela:shadow-[0_12px_32px_rgba(0,0,0,0.45)]',
		className
	)}
>
	{@render children()}
</div>
