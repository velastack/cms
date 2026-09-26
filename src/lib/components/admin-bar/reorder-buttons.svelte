<script lang="ts">
	/**
	 * Up / down / remove for one item in a structured list. Buttons rather
	 * than drag handles: they work with a keyboard, on touch, and inside a
	 * popover without a drag library.
	 */
	import ChevronUpIcon from './icons/chevron-up.svelte';
	import ChevronDownIcon from './icons/chevron-down.svelte';
	import TrashIcon from './icons/trash-2.svelte';
	import { Button } from './ui/button/index.js';

	type Props = {
		index: number;
		count: number;
		onMove: (from: number, to: number) => void;
		onRemove: (index: number) => void;
		label?: string;
	};
	let { index, count, onMove, onRemove, label = 'item' }: Props = $props();
</script>

<div class="vela:flex vela:items-center vela:gap-0.5 vela:shrink-0">
	<Button
		size="icon"
		variant="ghost"
		class="vela:h-6 vela:w-6"
		aria-label={`Move ${label} up`}
		disabled={index === 0}
		onclick={() => onMove(index, index - 1)}
	>
		<ChevronUpIcon class="vela:size-3.5" />
	</Button>
	<Button
		size="icon"
		variant="ghost"
		class="vela:h-6 vela:w-6"
		aria-label={`Move ${label} down`}
		disabled={index >= count - 1}
		onclick={() => onMove(index, index + 1)}
	>
		<ChevronDownIcon class="vela:size-3.5" />
	</Button>
	<Button
		size="icon"
		variant="ghost"
		class="vela:h-6 vela:w-6 vela:text-[var(--cms-status-error-text-base)]"
		aria-label={`Remove ${label}`}
		onclick={() => onRemove(index)}
	>
		<TrashIcon class="vela:size-3.5" />
	</Button>
</div>
