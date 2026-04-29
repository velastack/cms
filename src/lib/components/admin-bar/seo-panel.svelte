<script lang="ts">
	import { page } from '$app/state';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { pages } from 'virtual:vela-cms/pages';
	import { cmsStore, type CmsScopeRef } from '../cms/cms-store.svelte.js';
	import { getPageScope, type CmsPayload } from '../cms/scope.js';
	import {
		DEFAULT_METADATA_SCHEMA,
		fieldType,
		type CmsPageMetadataSchema,
		type MetadataFieldSchema
	} from './page-config.js';
	import PanelFooter from './panel-footer.svelte';
	import PanelHeader from './panel-header.svelte';
	import Panel from './panel.svelte';
	import { Button } from './ui/button/index.js';
	import * as Collapsible from './ui/collapsible/index.js';
	import { Input } from './ui/input/index.js';
	import { Textarea } from './ui/textarea/index.js';

	type Props = { onClose: () => void; onSave: () => void | Promise<void> };
	let { onClose, onSave }: Props = $props();

	const TITLE_TARGET = 60;
	const DESC_TARGET = 155;
	// "Approaches" the limit at 80% — past this, color shifts amber to nudge.
	const TITLE_AMBER_AT = Math.floor(TITLE_TARGET * 0.8);
	const DESC_AMBER_AT = Math.floor(DESC_TARGET * 0.8);

	const cms = $derived(page.data.cms as CmsPayload | undefined);
	const pageScope = $derived(getPageScope(cms));
	const ref = $derived<CmsScopeRef | null>(
		pageScope
			? { scopeId: pageScope.scopeId, routeId: pageScope.routeId, params: pageScope.params }
			: null
	);

	// Schema lives in the route's `page.cms.ts`. Fall back to default
	// title/description so every route gets at least the SEO basics.
	const schema = $derived.by<CmsPageMetadataSchema>(() => {
		if (!pageScope) return {};
		const cfg = pages[pageScope.routeId];
		return cfg?.metadata ?? DEFAULT_METADATA_SCHEMA;
	});

	const entries = $derived(Object.entries(schema));
	const advancedEntries = $derived(entries.filter(([k]) => k !== 'title' && k !== 'description'));

	const persistedValue = (key: string): unknown => {
		if (!ref) return undefined;
		const draft = cmsStore.getMetadataValue(ref, key);
		if (draft !== undefined) return draft;
		const ov = cmsStore.getMetadataOverlayValue(ref, key);
		if (ov !== undefined) return ov;
		return cms?.metadata[key];
	};

	// Local form state — typing only updates `local`; nothing reaches
	// cmsStore.metadataDrafts until Save fires. That keeps the bar's "X page
	// draft" badge from flickering as the user explores.
	let local = $state<Record<string, unknown>>({});

	$effect(() => {
		const next: Record<string, unknown> = {};
		for (const [k] of entries) next[k] = persistedValue(k);
		local = next;
	});

	const titleVal = $derived(typeof local.title === 'string' ? local.title : '');
	const descVal = $derived(typeof local.description === 'string' ? local.description : '');

	const breadcrumb = $derived.by(() => {
		const host = page.url.hostname || 'localhost';
		const segments = page.url.pathname.split('/').filter(Boolean);
		return segments.length === 0 ? host : `${host} › ${segments.join(' › ')}`;
	});

	let previewTab = $state<'search' | 'social'>('search');

	// Pull the live site's favicon — Google's result preview shows whichever
	// favicon the document head declares, so the SEO preview should match. Resolve
	// to absolute URLs (using `.href` rather than `.getAttribute`) so the img src
	// renders correctly regardless of where the favicon is hosted.
	let faviconHref = $state<string | null>(null);
	$effect(() => {
		if (typeof document === 'undefined') return;
		const link = document.querySelector<HTMLLinkElement>(
			'link[rel="icon"], link[rel~="icon"], link[rel="shortcut icon"]'
		);
		faviconHref = link?.href ?? null;
	});

	// Best-effort OG image: an explicit `og_image` field in the schema wins,
	// otherwise the first image-type metadata field. The Social card stays useful
	// even when neither exists — title/description still render against a
	// placeholder.
	const ogImageVal = $derived.by(() => {
		const og = stringValue(local.og_image);
		if (og) return og;
		for (const [k, s] of entries) {
			if (fieldType(s) !== 'image') continue;
			const v = stringValue(local[k]);
			if (v) return v;
		}
		return '';
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
			if (v !== persistedValue(k)) cmsStore.setMetadataValue(ref, k, v);
		}
		await onSave();
	};

	const fieldLabelClass = 'vela:text-[12px] vela:text-bar-text-secondary';
	const counterBaseClass = 'vela:text-[11px] vela:font-mono vela:tabular-nums';
	const selectClass =
		'vela:flex vela:h-9 vela:w-full vela:rounded-md vela:border vela:border-[var(--cms-bar-divider)]' +
		' vela:bg-[var(--cms-bar-bg-hover)] vela:px-3 vela:py-1 vela:text-[13px] vela:text-bar-text' +
		' vela:focus:outline-none vela:focus:ring-2 vela:focus:ring-[var(--cms-accent)]';

	const stringValue = (v: unknown): string => (typeof v === 'string' ? v : '');
	const numberValue = (v: unknown): number | null =>
		typeof v === 'number' && !Number.isNaN(v) ? v : null;
	const booleanValue = (v: unknown): boolean => v === true;

	const setNumber = (key: string, raw: string) => {
		if (raw === '') {
			local[key] = undefined;
		} else {
			const n = Number(raw);
			local[key] = Number.isFinite(n) ? n : undefined;
		}
	};

	const enumValues = (s: MetadataFieldSchema): readonly string[] =>
		typeof s !== 'string' && s.type === 'enum' ? s.values : [];
</script>

<Panel ariaLabel="SEO and metadata" {onClose}>
	<PanelHeader title="SEO &amp; metadata" {onClose} />

	<div class="vela:overflow-y-auto vela:px-4 vela:pb-4 vela:flex vela:flex-col vela:gap-4">
		{#if !pageScope}
			<p class="vela:text-[13px] vela:text-bar-text-tertiary vela:py-2">
				No page scope on this route.
			</p>
		{:else}
			<div class="vela:flex vela:flex-col vela:gap-2">
				<div
					role="tablist"
					aria-label="Preview format"
					class="vela:inline-flex vela:self-start vela:p-0.5 vela:rounded-md
						vela:bg-[var(--cms-bar-bg-hover)] vela:border vela:border-[var(--cms-bar-divider)]"
				>
					<button
						type="button"
						role="tab"
						aria-selected={previewTab === 'search'}
						onclick={() => (previewTab = 'search')}
						class="vela:px-2.5 vela:py-1 vela:rounded vela:text-[11px] vela:font-medium
							vela:cursor-pointer vela:transition-colors
							{previewTab === 'search'
							? 'vela:bg-bar-bg vela:text-bar-text'
							: 'vela:text-bar-text-secondary vela:hover:text-bar-text'}"
					>
						Search
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={previewTab === 'social'}
						onclick={() => (previewTab = 'social')}
						class="vela:px-2.5 vela:py-1 vela:rounded vela:text-[11px] vela:font-medium
							vela:cursor-pointer vela:transition-colors
							{previewTab === 'social'
							? 'vela:bg-bar-bg vela:text-bar-text'
							: 'vela:text-bar-text-secondary vela:hover:text-bar-text'}"
					>
						Social
					</button>
				</div>

				{#if previewTab === 'search'}
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
							{titleVal || 'Page title'}
						</div>
						<div class="vela:mt-1 vela:text-[13px] vela:leading-snug vela:text-[#4d5156]">
							{descVal || 'Meta description appears here.'}
						</div>
					</div>
				{:else}
					<div
						class="vela:bg-white vela:text-[#0f1419] vela:rounded-lg vela:overflow-hidden
							vela:border vela:border-[#e8eaed]"
					>
						<div
							class="vela:aspect-[1.91/1] vela:bg-[#e8eaed] vela:flex vela:items-center vela:justify-center vela:overflow-hidden"
						>
							{#if ogImageVal}
								<img src={ogImageVal} alt="" class="vela:w-full vela:h-full vela:object-cover" />
							{:else}
								<span class="vela:text-[11px] vela:text-[#5f6368]">No social image set</span>
							{/if}
						</div>
						<div
							class="vela:px-3.5 vela:py-2.5 vela:border-t vela:border-[#e8eaed] vela:bg-[#f7f9fa]"
						>
							<div class="vela:text-[11px] vela:uppercase vela:text-[#5f6368]">
								{hostname}
							</div>
							<div
								class="vela:mt-0.5 vela:text-[14px] vela:font-semibold vela:leading-snug vela:line-clamp-2"
							>
								{titleVal || 'Page title'}
							</div>
							<div
								class="vela:mt-0.5 vela:text-[12px] vela:leading-snug vela:text-[#536471] vela:line-clamp-2"
							>
								{descVal || 'Meta description appears here.'}
							</div>
						</div>
					</div>
				{/if}
			</div>

			{#if 'title' in schema}
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
					<Input
						type="text"
						value={stringValue(local.title)}
						oninput={(e) => (local.title = e.currentTarget.value)}
					/>
				</label>
			{/if}

			{#if 'description' in schema}
				<label class="vela:flex vela:flex-col vela:gap-1.5">
					<div class="vela:flex vela:items-center vela:justify-between">
						<span class={fieldLabelClass}>Description</span>
						<span
							class="{counterBaseClass} {counterClass(descVal.length, DESC_TARGET, DESC_AMBER_AT)}"
						>
							{descVal.length} / {DESC_TARGET}
						</span>
					</div>
					<Textarea
						value={stringValue(local.description)}
						oninput={(e) => (local.description = e.currentTarget.value)}
					/>
				</label>
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
								{@const t = fieldType(fieldSchema)}
								{#if t === 'boolean'}
									<label
										class="vela:flex vela:items-center vela:gap-2 vela:text-[13px] vela:text-bar-text"
									>
										<input
											type="checkbox"
											checked={booleanValue(local[key])}
											onchange={(e) => (local[key] = e.currentTarget.checked)}
										/>
										<span>{key}</span>
									</label>
								{:else}
									<label class="vela:flex vela:flex-col vela:gap-1.5">
										<span class={fieldLabelClass}>{key}</span>
										{#if t === 'long-string'}
											<Textarea
												value={stringValue(local[key])}
												oninput={(e) => (local[key] = e.currentTarget.value)}
											/>
										{:else if t === 'number'}
											<Input
												type="number"
												value={numberValue(local[key]) ?? ''}
												oninput={(e) => setNumber(key, e.currentTarget.value)}
											/>
										{:else if t === 'date'}
											<Input
												type="date"
												value={stringValue(local[key])}
												oninput={(e) => (local[key] = e.currentTarget.value)}
											/>
										{:else if t === 'image'}
											<Input
												type="url"
												placeholder="https://…"
												value={stringValue(local[key])}
												oninput={(e) => (local[key] = e.currentTarget.value)}
											/>
										{:else if t === 'enum'}
											<select
												class={selectClass}
												value={stringValue(local[key])}
												onchange={(e) => (local[key] = e.currentTarget.value)}
											>
												<option value="">—</option>
												{#each enumValues(fieldSchema) as v (v)}
													<option value={v}>{v}</option>
												{/each}
											</select>
										{:else}
											<Input
												type="text"
												value={stringValue(local[key])}
												oninput={(e) => (local[key] = e.currentTarget.value)}
											/>
										{/if}
									</label>
								{/if}
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
			<Button size="pill" onclick={handleSave}>Save</Button>
		</div>
	</PanelFooter>
</Panel>
