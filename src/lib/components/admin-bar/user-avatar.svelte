<script lang="ts">
	import { cn } from './utils.js';

	type Props = {
		name: string;
		class?: string;
	};
	let { name, class: className }: Props = $props();

	const initials = $derived(
		name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('')
	);
</script>

<span
	class={cn(
		'vela:inline-flex vela:items-center vela:justify-center vela:w-7 vela:h-7 vela:rounded-full',
		'vela:bg-[var(--cms-accent)] vela:text-white vela:text-[11px] vela:font-semibold',
		className
	)}
	title={name}
>
	{initials}
</span>
