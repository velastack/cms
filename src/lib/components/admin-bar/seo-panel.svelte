<script lang="ts">
	import { page } from '$app/state';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { cmsStore, type CmsScopeRef } from '../cms/cms-store.svelte.js';
	import { getPageScope, type CmsPayload } from '../cms/scope.js';
	import PanelFooter from './panel-footer.svelte';
	import PanelHeader from './panel-header.svelte';
	import Panel from './panel.svelte';
	import { Button } from './ui/button/index.js';
	import * as Collapsible from './ui/collapsible/index.js';
	import { Input } from './ui/input/index.js';
	import { Textarea } from './ui/textarea/index.js';

	type Props = { onClose: () => void };
	let { onClose }: Props = $props();

	const TITLE_TARGET = 60;
	const DESC_TARGET = 155;
	// "Approaches" the limit at 80% — past this, color shifts amber to nudge.
	const TITLE_AMBER_AT = Math.floor(TITLE_TARGET * 0.8);
	const DESC_AMBER_AT = Math.floor(DESC_TARGET * 0.8);

	const cms = $derived(page.data.cms as CmsPayload | undefined);
	const pageScope = $derived(getPageScope(cms));
	const fields = $derived(pageScope?.metadata ?? []);
	const ref = $derived<CmsScopeRef | null>(
		pageScope
			? { scopeId: pageScope.scopeId, routeId: pageScope.routeId, params: pageScope.params }
			: null
	);

	const persistedValue = (key: string): string => {
		if (!ref) return '';
		const draft = cmsStore.getMetadataValue(ref, key);
		if (typeof draft === 'string') return draft;
		const ov = cmsStore.getMetadataOverlayValue(ref, key);
		if (typeof ov === 'string') return ov;
		const published = cms?.metadata[key];
		return typeof published === 'string' ? published : '';
	};

	// Local form state — typing only updates `local`; nothing reaches
	// cmsStore.metadataDrafts until Save fires. That keeps the bar's "X page
	// draft" badge from flickering as the user explores.
	let local = $state<Record<string, string>>({});

	$effect(() => {
		const next: Record<string, string> = {};
		for (const k of fields) next[k] = persistedValue(k);
		local = next;
	});

	const titleVal = $derived(local.title ?? '');
	const descVal = $derived(local.description ?? '');
	const advancedFields = $derived(fields.filter((f) => f !== 'title' && f !== 'description'));

	const breadcrumb = $derived.by(() => {
		const host = page.url.hostname || 'localhost';
		const segments = page.url.pathname.split('/').filter(Boolean);
		return segments.length === 0 ? host : `${host} › ${segments.join(' › ')}`;
	});

	const counterClass = (n: number, target: number, amberAt: number): string => {
		if (n > target) return 'vela:text-destructive';
		if (n >= amberAt) return 'vela:text-[var(--cms-status-warn-text)]';
		return 'vela:text-bar-text-tertiary';
	};

	const onSave = () => {
		if (!ref) return onClose();
		for (const k of fields) {
			const v = local[k] ?? '';
			if (v !== persistedValue(k)) cmsStore.setMetadataValue(ref, k, v);
		}
		onClose();
	};

	const fieldLabelClass = 'vela:text-[12px] vela:text-bar-text-secondary';
	const counterBaseClass = 'vela:text-[11px] vela:font-mono vela:tabular-nums';
</script>

<Panel ariaLabel="SEO and metadata" {onClose}>
	<PanelHeader title="SEO &amp; metadata" {onClose} />

	<div class="vela:overflow-y-auto vela:px-4 vela:pb-4 vela:flex vela:flex-col vela:gap-4">
		{#if !pageScope}
			<p class="vela:text-[13px] vela:text-bar-text-tertiary vela:py-2">
				No page scope on this route.
			</p>
		{:else if fields.length === 0}
			<p class="vela:text-[13px] vela:text-bar-text-tertiary vela:py-2">
				No metadata fields configured for this page.
			</p>
		{:else}
			<div class="vela:flex vela:flex-col vela:gap-2">
				<span
					class="vela:text-[10px] vela:font-semibold vela:uppercase vela:tracking-widest vela:text-bar-text-tertiary"
				>
					Preview · Google result
				</span>
				<div
					class="vela:bg-[#fafafa] vela:text-[#202124] vela:rounded-lg vela:p-3.5
						vela:border vela:border-[#e8eaed]"
				>
					<div class="vela:flex vela:items-center vela:gap-1.5 vela:text-[12px]">
						<span
							class="vela:inline-flex vela:items-center vela:justify-center vela:w-4 vela:h-4 vela:rounded-full vela:bg-[var(--cms-accent)]"
						></span>
						<span class="vela:text-[#202124]">{breadcrumb}</span>
						<span class="vela:text-[#5f6368]">›</span>
					</div>
					<div
						class="vela:mt-1.5 vela:text-[18px] vela:leading-snug vela:text-[#1a0dab] vela:truncate"
					>
						{titleVal || 'Page title'}
					</div>
					<div class="vela:mt-1 vela:text-[13px] vela:leading-snug vela:text-[#4d5156]">
						{descVal || 'Meta description appears here.'}
					</div>
				</div>
			</div>

			{#if fields.includes('title')}
				<label class="vela:flex vela:flex-col vela:gap-1.5">
					<div class="vela:flex vela:items-center vela:justify-between">
						<span class={fieldLabelClass}>Title</span>
						<span
							class="{counterBaseClass} {counterClass(
								titleVal.length,
								TITLE_TARGET,
								TITLE_AMBER_AT
							)}"
						>
							{titleVal.length} / {TITLE_TARGET}
						</span>
					</div>
					<Input type="text" bind:value={local.title} />
				</label>
			{/if}

			{#if fields.includes('description')}
				<label class="vela:flex vela:flex-col vela:gap-1.5">
					<div class="vela:flex vela:items-center vela:justify-between">
						<span class={fieldLabelClass}>Description</span>
						<span
							class="{counterBaseClass} {counterClass(
								descVal.length,
								DESC_TARGET,
								DESC_AMBER_AT
							)}"
						>
							{descVal.length} / {DESC_TARGET}
						</span>
					</div>
					<Textarea bind:value={local.description} />
				</label>
			{/if}

			{#if advancedFields.length > 0}
				<Collapsible.Root
					class="vela:border-t vela:border-[var(--cms-bar-divider)] vela:pt-3"
				>
					<Collapsible.Trigger
						class="vela:group vela:flex vela:items-center vela:justify-between vela:w-full
							vela:text-left vela:text-[13px] vela:text-bar-text-secondary
							vela:hover:text-bar-text vela:cursor-pointer vela:focus:outline-none"
					>
						<span>Advanced</span>
						<ChevronDownIcon
							class="vela:size-4 vela:transition-transform vela:group-data-[state=open]:rotate-180"
						/>
					</Collapsible.Trigger>
					<Collapsible.Content>
						<div class="vela:flex vela:flex-col vela:gap-3 vela:mt-3">
							{#each advancedFields as key (key)}
								<label class="vela:flex vela:flex-col vela:gap-1.5">
									<span class={fieldLabelClass}>{key}</span>
									<Input type="text" bind:value={local[key]} />
								</label>
							{/each}
						</div>
					</Collapsible.Content>
				</Collapsible.Root>
			{/if}
		{/if}
	</div>

	<PanelFooter>
		<span>Save to keep your changes</span>
		<div class="vela:flex vela:items-center vela:gap-1.5">
			<Button variant="ghost" size="pill" onclick={onClose}>Cancel</Button>
			<Button size="pill" onclick={onSave}>Save</Button>
		</div>
	</PanelFooter>
</Panel>
