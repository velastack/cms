<script lang="ts">
	/**
	 * The line a field bound to the company profile shows in place of the
	 * inputs the company owns: where they are edited.
	 */
	import { companyManagedBy } from '../../core/shapes/company.js';
	import { cmsStore } from '../cms/cms-store.svelte.js';
	import { Button } from './ui/button/index.js';

	type Props = { onOpen?: () => void };
	let { onOpen }: Props = $props();

	const manager = $derived(companyManagedBy(cmsStore.site));
</script>

{#if manager}
	<p class="vela:m-0 vela:text-[12px] vela:text-bar-text-secondary">
		Managed by
		{#if manager.url}
			<a class="vela:underline vela:text-bar-text" href={manager.url} target="_blank" rel="noopener"
				>{manager.by}</a
			>
		{:else}
			{manager.by}
		{/if}
	</p>
{:else}
	<Button
		variant="outline"
		size="pill"
		class="vela:self-start"
		onclick={() => {
			onOpen?.();
			cmsStore.companyPanelOpen = true;
		}}
	>
		Edit in Company
	</Button>
{/if}
