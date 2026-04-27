<script lang="ts">
	import { page } from '$app/state';
	import { getPageScope, type CmsPayload } from '../cms/scope.js';
	import { cmsStore, type CmsScopeRef } from '../cms/cms-store.svelte.js';

	type Props = { onClose: () => void };
	let { onClose }: Props = $props();

	const cms = $derived(page.data.cms as CmsPayload | undefined);
	const pageScope = $derived(getPageScope(cms));
	const fields = $derived(pageScope?.metadata ?? []);
	const ref = $derived<CmsScopeRef | null>(
		pageScope
			? { scopeId: pageScope.scopeId, routeId: pageScope.routeId, params: pageScope.params }
			: null
	);

	const valueFor = (key: string): string => {
		if (!ref) return '';
		const draft = cmsStore.getMetadataValue(ref, key);
		if (typeof draft === 'string') return draft;
		const published = cms?.metadata[key];
		return typeof published === 'string' ? published : '';
	};

	const update = (key: string, value: string) => {
		if (!ref) return;
		cmsStore.setMetadataValue(ref, key, value);
	};

	const scopeLabel = $derived(
		pageScope
			? Object.keys(pageScope.params).length > 0
				? `${pageScope.scopeId} ${JSON.stringify(pageScope.params)}`
				: pageScope.scopeId
			: ''
	);
</script>

<div class="cms-seo" role="dialog" aria-label="Page SEO">
	<header class="cms-seo__header">
		<h2>SEO</h2>
		{#if pageScope}
			<small class="cms-seo__scope">{scopeLabel}</small>
		{/if}
		<button type="button" class="cms-seo__close" aria-label="Close" onclick={onClose}>×</button>
	</header>

	{#if !pageScope}
		<p class="cms-seo__empty">No page scope on this route.</p>
	{:else if !fields.length}
		<p class="cms-seo__empty">No metadata fields configured for this page.</p>
	{:else}
		<div class="cms-seo__fields">
			{#each fields as key}
				<label class="cms-seo__field">
					<span>{key}</span>
					<input
						type="text"
						value={valueFor(key)}
						placeholder={key}
						oninput={(e) => update(key, (e.target as HTMLInputElement).value)}
					/>
				</label>
			{/each}
		</div>
	{/if}
</div>

<style>
	.cms-seo {
		position: fixed;
		top: 4rem;
		left: 50%;
		transform: translateX(-50%);
		width: min(100%, 32rem);
		padding: 1rem;
		border-radius: 0.75rem;
		background: rgba(20, 20, 20, 0.92);
		color: #fafafa;
		backdrop-filter: blur(8px);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
		z-index: 9998;
		font-family:
			ui-sans-serif,
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			sans-serif;
		font-size: 0.85rem;
	}
	.cms-seo__header {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.cms-seo__header h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}
	.cms-seo__scope {
		flex: 1;
		font-family: ui-monospace, monospace;
		font-size: 0.7rem;
		opacity: 0.6;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cms-seo__close {
		width: 1.75rem;
		height: 1.75rem;
		border: 0;
		border-radius: 9999px;
		background: rgba(255, 255, 255, 0.06);
		color: inherit;
		cursor: pointer;
		font-size: 1.1rem;
		line-height: 1;
	}
	.cms-seo__close:hover {
		background: rgba(255, 255, 255, 0.14);
	}
	.cms-seo__empty {
		margin: 0;
		opacity: 0.7;
	}
	.cms-seo__fields {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}
	.cms-seo__field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.cms-seo__field span {
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		opacity: 0.7;
	}
	.cms-seo__field input {
		padding: 0.4rem 0.625rem;
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 0.375rem;
		background: rgba(255, 255, 255, 0.04);
		color: inherit;
		font: inherit;
	}
	.cms-seo__field input:focus {
		outline: 2px solid rgb(99, 102, 241);
		outline-offset: 1px;
	}
</style>
