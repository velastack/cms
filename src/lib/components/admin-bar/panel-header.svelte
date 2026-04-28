<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import type { Snippet } from 'svelte';
	import { Button } from './ui/button/index.js';
	import { cn } from './utils.js';

	type Props = {
		title: string;
		onClose: () => void;
		class?: string;
		subtitle?: Snippet;
	};
	let { title, onClose, class: className, subtitle }: Props = $props();
</script>

<div
	class={cn(
		'vela:flex vela:items-center vela:justify-between vela:px-4 vela:pt-3.5 vela:pb-3',
		className
	)}
>
	<div class="vela:flex vela:items-baseline vela:gap-2 vela:min-w-0">
		<h2 class="vela:text-[15px] vela:font-semibold vela:m-0">{title}</h2>
		{#if subtitle}{@render subtitle()}{/if}
	</div>
	<Button variant="ghost" size="pill-icon" aria-label="Close" onclick={onClose}>
		<XIcon class="vela:size-4" />
	</Button>
</div>
