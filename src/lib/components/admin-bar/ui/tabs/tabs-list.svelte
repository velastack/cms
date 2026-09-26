<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '../../utils.js';

	let { ref = $bindable(null), class: className, ...restProps }: TabsPrimitive.ListProps = $props();
</script>

<TabsPrimitive.List
	bind:ref
	data-slot="tabs-list"
	class={cn(
		'vela:inline-flex vela:self-start vela:items-center vela:justify-center vela:p-0.5 vela:rounded-md vela:bg-[var(--cms-bar-bg-hover)] vela:border vela:border-[var(--cms-bar-divider)]',
		className
	)}
	{...restProps}
/>
