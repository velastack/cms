<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '../../utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: TabsPrimitive.TriggerProps = $props();
</script>

<TabsPrimitive.Trigger
	bind:ref
	data-slot="tabs-trigger"
	class={cn(
		'vela:inline-flex vela:items-center vela:justify-center vela:gap-1.5 vela:px-2.5 vela:py-1 vela:rounded vela:text-[11px] vela:font-medium vela:whitespace-nowrap vela:cursor-pointer vela:transition-colors vela:text-bar-text-secondary vela:hover:text-bar-text vela:data-[state=active]:bg-bar-bg vela:data-[state=active]:text-bar-text vela:focus-visible:outline-none vela:focus-visible:ring-2 vela:focus-visible:ring-[var(--cms-accent)] vela:disabled:pointer-events-none vela:disabled:opacity-50',
		className
	)}
	{...restProps}
/>
