<script lang="ts">
	import { page } from '$app/state';
	import ChevronDownIcon from './icons/chevron-down.svelte';
	import { pages } from 'virtual:vela-cms/pages';
	import { cmsStore, type CmsScopeRef } from '../cms/cms-store.svelte.js';
	import { getPageScope, type CmsPayload } from '../cms/scope.js';
	import { ROOT_SCOPE_ID } from '../cms/use-cms-field.svelte.js';
	import { toMetaTags } from '../../core/metadata.js';
	import FieldInput, { type FieldInputType } from './field-input.svelte';
	import {
		fieldType,
		metadataSchemaFor,
		type CmsPageMetadataSchema,
		type MetadataFieldSchema
	} from './page-config.js';
	import PanelFooter from './panel-footer.svelte';
	import PanelHeader from './panel-header.svelte';
	import Panel from './panel.svelte';
	import { Button } from './ui/button/index.js';
	import * as Collapsible from './ui/collapsible/index.js';
	import * as Tabs from './ui/tabs/index.js';

	type Props = { onClose: () => void; onSave: () => void | Promise<void> };
	let { onClose, onSave }: Props = $props();

	const TITLE_TARGET = 60;
	const DESC_TARGET = 155;
	// "Approaches" the limit at 80% — past this, color shifts amber to nudge.
	const TITLE_AMBER_AT = Math.floor(TITLE_TARGET * 0.8);
	const DESC_AMBER_AT = Math.floor(DESC_TARGET * 0.8);

	// The search snippet and the share card; everything else is advanced.
	const PRIMARY = ['title', 'description'];
	const SHARE = ['ogTitle', 'ogDescription', 'ogImage', 'twitterCard'];
	const LABELS: Record<string, string> = {
		title: 'Title',
		description: 'Description',
		ogTitle: 'Share title',
		ogDescription: 'Share description',
		ogImage: 'Share image',
		twitterCard: 'Twitter card',
		canonical: 'Canonical URL',
		noindex: 'Hide from search engines'
	};

	const cms = $derived(page.data.cms as CmsPayload | undefined);
	const pageScope = $derived(getPageScope(cms));
	const ref = $derived<CmsScopeRef | null>(
		pageScope
			? { scopeId: pageScope.scopeId, routeId: pageScope.routeId, params: pageScope.params }
			: null
	);

	// The route's `page.cms.ts` schema merged over the defaults, so every
	// route gets the search snippet, the share card and indexing controls.
	const schema = $derived.by<CmsPageMetadataSchema>(() => {
		if (!pageScope) return {};
		return metadataSchemaFor(pages[pageScope.routeId]?.metadata);
	});

	const entries = $derived(Object.entries(schema));
	const shareEntries = $derived(entries.filter(([k]) => SHARE.includes(k)));
	const advancedEntries = $derived(
		entries.filter(([k]) => !PRIMARY.includes(k) && !SHARE.includes(k))
	);

	const persistedValue = (key: string): unknown => {
		if (!ref) return undefined;
		return cmsStore.getValue(ref, `metadata.${key}`);
	};

	// The title template reads the root layout's branding name, exactly as
	// `toMetaTags` does at render time.
	const siteName = $derived.by(() => {
		const v = cmsStore.getValue(
			{ scopeId: ROOT_SCOPE_ID, routeId: '/', params: {} },
			'branding.name'
		);
		return typeof v === 'string' && v ? v : undefined;
	});

	// Local form state — typing only updates `local`; nothing reaches the
	// draft until Save fires. That keeps the bar's "X page draft" badge from
	// flickering as the user explores.
	let local = $state<Record<string, unknown>>({});

	$effect(() => {
		const next: Record<string, unknown> = {};
		for (const [k] of entries) next[k] = persistedValue(k);
		local = next;
	});

	const stringValue = (v: unknown): string => (typeof v === 'string' ? v : '');
	const titleVal = $derived(stringValue(local.title));
	const descVal = $derived(stringValue(local.description));
	const preview = $derived(toMetaTags(local, { siteName }));
	const fullTitle = $derived(
		preview.title
			? preview.titleTemplate
				? preview.titleTemplate.replace('%s', preview.title)
				: preview.title
			: ''
	);

	const breadcrumb = $derived.by(() => {
		const host = page.url.hostname || 'localhost';
		const segments = page.url.pathname.split('/').filter(Boolean);
		return segments.length === 0 ? host : `${host} › ${segments.join(' › ')}`;
	});

	let previewTab = $state('search');

	// Pull the live site's favicon — Google's result preview shows whichever
	// favicon the document head declares, so the SEO preview should match.
	let faviconHref = $state<string | null>(null);
	$effect(() => {
		if (typeof document === 'undefined') return;
		const link = document.querySelector<HTMLLinkElement>(
			'link[rel="icon"], link[rel~="icon"], link[rel="shortcut icon"]'
		);
		faviconHref = link?.href ?? null;
	});

	const hostname = $derived(page.url.hostname || 'localhost');

	const counterClass = (n: number, target: number, amberAt: number): string => {
		if (n > target) return 'vela:text-destructive';
		if (n >= amberAt) return 'vela:text-[var(--cms-status-warn-text)]';
		return 'vela:text-bar-text-tertiary';
	};

	const handleSave = async () => {
		if (!ref) return onClose();
		for (const [k] of entries) {
			const v = local[k];
			if (v !== persistedValue(k)) cmsStore.setValue(ref, `metadata.${k}`, v);
		}
		await onSave();
	};

	const counterBaseClass = 'vela:text-[11px] vela:font-mono vela:tabular-nums';

	const inputType = (s: MetadataFieldSchema): FieldInputType => {
		const t = fieldType(s);
		return t === 'string' ? 'text' : t;
	};
	const enumValues = (s: MetadataFieldSchema): readonly string[] =>
		typeof s !== 'string' && s.type === 'enum' ? s.values : [];
	const labelFor = (key: string) => LABELS[key] ?? key;
</script>

<Panel ariaLabel="SEO and metadata" {onClose}>
	<PanelHeader title="SEO &amp; metadata" {onClose}>
		{#snippet subtitle()}
			<span class="vela:font-mono vela:text-[12px] vela:text-bar-text-secondary">
				{page.url.pathname}
			</span>
		{/snippet}
	</PanelHeader>

	<form
		class="vela:overflow-y-auto vela:px-4 vela:pb-4 vela:flex vela:flex-col vela:gap-4"
		onsubmit={(e) => {
			e.preventDefault();
			handleSave();
		}}
	>
		{#if !pageScope}
			<p class="vela:text-[13px] vela:text-bar-text-tertiary vela:py-2">
				No page scope on this route.
			</p>
		{:else}
			<Tabs.Root bind:value={previewTab}>
				<Tabs.List aria-label="Preview format">
					<Tabs.Trigger value="search">Search</Tabs.Trigger>
					<Tabs.Trigger value="social">Social</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="search">
					<div
						class="vela:bg-[#fafafa] vela:text-[#202124] vela:rounded-lg vela:p-3.5
							vela:border vela:border-[#e8eaed]"
					>
						<div class="vela:flex vela:items-center vela:gap-1.5 vela:text-[12px]">
							{#if faviconHref}
								<img
									src={faviconHref}
									alt=""
									class="vela:w-4 vela:h-4 vela:rounded-full vela:bg-white vela:object-contain"
								/>
							{:else}
								<span
									class="vela:inline-flex vela:items-center vela:justify-center vela:w-4 vela:h-4 vela:rounded-full vela:bg-[var(--cms-accent)]"
								></span>
							{/if}
							<span class="vela:text-[#202124]">{breadcrumb}</span>
						</div>
						<div
							class="vela:mt-1.5 vela:text-[18px] vela:leading-snug vela:text-[#1a0dab] vela:truncate"
						>
							{fullTitle || 'Page title'}
						</div>
						<div class="vela:mt-1 vela:text-[13px] vela:leading-snug vela:text-[#4d5156]">
							{preview.description || 'Meta description appears here.'}
						</div>
					</div>
				</Tabs.Content>

				<Tabs.Content value="social">
					<div
						class="vela:bg-white vela:text-[#0f1419] vela:rounded-lg vela:overflow-hidden
							vela:border vela:border-[#e8eaed]"
					>
						<div
							class="vela:aspect-[1.91/1] vela:bg-[#e8eaed] vela:flex vela:items-center vela:justify-center vela:overflow-hidden"
						>
							{#if preview.openGraph?.images?.[0]}
								<img
									src={preview.openGraph.images[0].url}
									alt=""
									class="vela:w-full vela:h-full vela:object-cover"
								/>
							{:else}
								<span class="vela:text-[11px] vela:text-[#5f6368]">No share image set</span>
							{/if}
						</div>
						<div
							class="vela:px-3.5 vela:py-2.5 vela:border-t vela:border-[#e8eaed] vela:bg-[#f7f9fa]"
						>
							<div class="vela:text-[11px] vela:uppercase vela:text-[#5f6368]">
								{siteName ?? hostname}
							</div>
							<div
								class="vela:mt-0.5 vela:text-[14px] vela:font-semibold vela:leading-snug vela:line-clamp-2"
							>
								{preview.openGraph?.title || 'Page title'}
							</div>
							<div
								class="vela:mt-0.5 vela:text-[12px] vela:leading-snug vela:text-[#536471] vela:line-clamp-2"
							>
								{preview.openGraph?.description || 'Meta description appears here.'}
							</div>
						</div>
					</div>
				</Tabs.Content>
			</Tabs.Root>

			{#if 'title' in schema}
				<FieldInput
					type="text"
					label="Title"
					value={local.title}
					onChange={(v) => (local.title = v ?? '')}
					hint={`${titleVal.length} / ${TITLE_TARGET}`}
					hintClass="{counterBaseClass} {counterClass(
						titleVal.length,
						TITLE_TARGET,
						TITLE_AMBER_AT
					)}"
				/>
			{/if}

			{#if 'description' in schema}
				<FieldInput
					type="long-string"
					label="Description"
					value={local.description}
					onChange={(v) => (local.description = v ?? '')}
					hint={`${descVal.length} / ${DESC_TARGET}`}
					hintClass="{counterBaseClass} {counterClass(descVal.length, DESC_TARGET, DESC_AMBER_AT)}"
				/>
			{/if}

			{#if shareEntries.length > 0}
				<Collapsible.Root class="vela:border-t vela:border-[var(--cms-bar-divider)] vela:pt-3">
					<Collapsible.Trigger
						class="vela:group vela:flex vela:items-center vela:justify-between vela:w-full
							vela:text-left vela:text-[13px] vela:text-bar-text-secondary
							vela:hover:text-bar-text vela:cursor-pointer vela:focus:outline-none"
					>
						<span>Share card</span>
						<ChevronDownIcon
							class="vela:size-4 vela:transition-transform vela:group-data-[state=open]:rotate-180"
						/>
					</Collapsible.Trigger>
					<Collapsible.Content>
						<div class="vela:flex vela:flex-col vela:gap-3 vela:mt-3">
							<p class="vela:text-[11px] vela:text-bar-text-tertiary vela:m-0">
								Blank fields reuse the title and description above.
							</p>
							{#each shareEntries as [key, fieldSchema] (key)}
								<FieldInput
									type={inputType(fieldSchema)}
									label={labelFor(key)}
									values={enumValues(fieldSchema)}
									value={local[key]}
									onChange={(v) => (local[key] = v)}
								/>
							{/each}
						</div>
					</Collapsible.Content>
				</Collapsible.Root>
			{/if}

			{#if advancedEntries.length > 0}
				<Collapsible.Root class="vela:border-t vela:border-[var(--cms-bar-divider)] vela:pt-3">
					<Collapsible.Trigger
						class="vela:group vela:flex vela:items-center vela:justify-between vela:w-full
							vela:text-left vela:text-[13px] vela:text-bar-text-secondary
							vela:hover:text-bar-text vela:cursor-pointer vela:focus:outline-none"
					>
						<span>More fields</span>
						<ChevronDownIcon
							class="vela:size-4 vela:transition-transform vela:group-data-[state=open]:rotate-180"
						/>
					</Collapsible.Trigger>
					<Collapsible.Content>
						<div class="vela:flex vela:flex-col vela:gap-3 vela:mt-3">
							{#each advancedEntries as [key, fieldSchema] (key)}
								<FieldInput
									type={inputType(fieldSchema)}
									label={labelFor(key)}
									values={enumValues(fieldSchema)}
									value={local[key]}
									onChange={(v) => (local[key] = v)}
								/>
							{/each}
						</div>
					</Collapsible.Content>
				</Collapsible.Root>
			{/if}
		{/if}
	</form>

	<PanelFooter>
		<span>Save to keep your changes</span>
		<div class="vela:flex vela:items-center vela:gap-1.5">
			<Button variant="ghost" size="pill" onclick={onClose}>Cancel</Button>
			<Button size="pill" onclick={handleSave}>Save</Button>
		</div>
	</PanelFooter>
</Panel>
