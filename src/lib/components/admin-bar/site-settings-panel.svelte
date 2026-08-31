<script lang="ts">
	import { page } from '$app/state';
	import ImagesIcon from '@lucide/svelte/icons/images';
	import { cmsStore, type MediaItem } from '$lib/components/cms/cms-store.svelte.js';
	import CmsMediaPicker from '$lib/components/cms/cms-media-picker.svelte';
	import type {
		CmsPayload,
		SiteFieldSchema,
		SiteSchema
	} from '$lib/components/cms/scope.js';
	import { clickOutside } from './click-outside.js';
	import PanelFooter from './panel-footer.svelte';
	import PanelHeader from './panel-header.svelte';
	import Panel from './panel.svelte';
	import { Button } from './ui/button/index.js';
	import { Input } from './ui/input/index.js';
	import { Textarea } from './ui/textarea/index.js';

	type Props = { onClose: () => void; onSave: () => void | Promise<void> };
	let { onClose, onSave }: Props = $props();

	const cms = $derived(page.data.cms as CmsPayload | undefined);
	const schema = $derived<SiteSchema>(cms?.site?.schema ?? {});
	const endpoint = $derived(cms?.endpoint ?? '/api/cms');

	// Flat (path → schema) view for save/reset; sections preserved for layout.
	const sections = $derived(Object.entries(schema));
	const allFieldPaths = $derived.by(() => {
		const out: Array<{ path: string; schema: SiteFieldSchema }> = [];
		for (const [sectionKey, section] of sections) {
			for (const [fieldKey, fieldSchema] of Object.entries(section.fields)) {
				out.push({ path: `${sectionKey}.${fieldKey}`, schema: fieldSchema });
			}
		}
		return out;
	});

	const persistedValue = (path: string): unknown => cmsStore.getSiteValue(path);

	// Local form state — typing only updates `local`; nothing reaches
	// `cmsStore.siteDraft` until Save fires (matches seo-panel.svelte). That
	// keeps the bar's "X drafts" count from flickering as the user explores.
	let local = $state<Record<string, unknown>>({});

	$effect(() => {
		const next: Record<string, unknown> = {};
		for (const { path } of allFieldPaths) next[path] = persistedValue(path);
		local = next;
	});

	// Per-field media library popover state — keyed by field path.
	let openLibrary = $state<string | null>(null);

	const fieldLabelClass = 'vela:text-[12px] vela:text-bar-text-secondary';

	const stringValue = (v: unknown): string => (typeof v === 'string' ? v : '');
	const numberValue = (v: unknown): number | null =>
		typeof v === 'number' && !Number.isNaN(v) ? v : null;

	const setNumber = (path: string, raw: string) => {
		if (raw === '') local[path] = undefined;
		else {
			const n = Number(raw);
			local[path] = Number.isFinite(n) ? n : undefined;
		}
	};

	const onLibrarySelect = (path: string, item: MediaItem) => {
		local[path] = item.url;
		openLibrary = null;
	};

	const handleSave = async () => {
		for (const { path } of allFieldPaths) {
			const v = local[path];
			if (v !== persistedValue(path)) cmsStore.setSiteValue(path, v);
		}
		await onSave();
	};
</script>

<Panel ariaLabel="Site settings" {onClose}>
	<PanelHeader title="Site settings" {onClose} />

	<form
		class="vela:overflow-y-auto vela:px-4 vela:pb-4 vela:flex vela:flex-col vela:gap-5"
		onsubmit={(e) => {
			e.preventDefault();
			handleSave();
		}}
	>
		{#if sections.length === 0}
			<p class="vela:text-[13px] vela:text-bar-text-tertiary vela:py-2">
				No site settings have been declared. Pass a <code>site</code> schema to
				<code>createCms()</code> to add fields here.
			</p>
		{:else}
			{#each sections as [sectionKey, section] (sectionKey)}
				<section class="vela:flex vela:flex-col vela:gap-3">
					<h3
						class="vela:text-[10px] vela:font-semibold vela:uppercase vela:tracking-widest vela:text-bar-text-tertiary vela:m-0"
					>
						{section.label}
					</h3>

					{#each Object.entries(section.fields) as [fieldKey, fieldSchema] (fieldKey)}
						{@const path = `${sectionKey}.${fieldKey}`}
						{#if fieldSchema.type === 'markdown'}
							<label class="vela:flex vela:flex-col vela:gap-1.5">
								<span class={fieldLabelClass}>{fieldSchema.label}</span>
								<Textarea
									value={stringValue(local[path])}
									placeholder={fieldSchema.placeholder ?? ''}
									oninput={(e) => (local[path] = e.currentTarget.value)}
								/>
							</label>
						{:else if fieldSchema.type === 'number'}
							<label class="vela:flex vela:flex-col vela:gap-1.5">
								<span class={fieldLabelClass}>{fieldSchema.label}</span>
								<Input
									type="number"
									value={numberValue(local[path]) ?? ''}
									placeholder={fieldSchema.placeholder ?? ''}
									oninput={(e) => setNumber(path, e.currentTarget.value)}
								/>
							</label>
						{:else if fieldSchema.type === 'datetime'}
							<label class="vela:flex vela:flex-col vela:gap-1.5">
								<span class={fieldLabelClass}>{fieldSchema.label}</span>
								<Input
									type="datetime-local"
									value={stringValue(local[path])}
									oninput={(e) => (local[path] = e.currentTarget.value)}
								/>
							</label>
						{:else if fieldSchema.type === 'color'}
							<label class="vela:flex vela:flex-col vela:gap-1.5">
								<span class={fieldLabelClass}>{fieldSchema.label}</span>
								<div class="vela:flex vela:items-center vela:gap-2">
									<input
										type="color"
										value={stringValue(local[path]) || '#000000'}
										oninput={(e) => (local[path] = e.currentTarget.value)}
										class="vela:h-9 vela:w-12 vela:rounded vela:border vela:border-[var(--cms-bar-divider)] vela:bg-[var(--cms-bar-bg-hover)] vela:cursor-pointer"
									/>
									<Input
										type="text"
										value={stringValue(local[path])}
										placeholder={fieldSchema.placeholder ?? '#1f1f1f'}
										oninput={(e) => (local[path] = e.currentTarget.value)}
									/>
								</div>
							</label>
						{:else if fieldSchema.type === 'url'}
							<label class="vela:flex vela:flex-col vela:gap-1.5">
								<span class={fieldLabelClass}>{fieldSchema.label}</span>
								<Input
									type="url"
									value={stringValue(local[path])}
									placeholder={fieldSchema.placeholder ?? 'https://…'}
									oninput={(e) => (local[path] = e.currentTarget.value)}
								/>
							</label>
						{:else if fieldSchema.type === 'image'}
							<div class="vela:flex vela:flex-col vela:gap-1.5">
								<span class={fieldLabelClass}>{fieldSchema.label}</span>
								<div class="vela:relative vela:flex vela:items-center vela:gap-2">
									<Input
										type="url"
										value={stringValue(local[path])}
										placeholder={fieldSchema.placeholder ?? 'https://…'}
										oninput={(e) => (local[path] = e.currentTarget.value)}
									/>
									<Button
										type="button"
										variant="ghost"
										size="pill-icon"
										aria-label="Choose from media library"
										onclick={() => (openLibrary = openLibrary === path ? null : path)}
									>
										<ImagesIcon class="vela:size-4" />
									</Button>
									{#if openLibrary === path}
										<div
											role="dialog"
											aria-label="Choose from media library"
											class="vela:absolute vela:right-0 vela:top-full vela:mt-1 vela:z-30
												vela:p-2 vela:rounded-md vela:bg-bar-bg
												vela:border vela:border-[var(--cms-bar-divider)]
												vela:shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
											use:clickOutside={() => (openLibrary = null)}
										>
											<CmsMediaPicker
												{endpoint}
												onSelect={(item) => onLibrarySelect(path, item)}
											/>
										</div>
									{/if}
								</div>
								{#if stringValue(local[path])}
									<img
										src={stringValue(local[path])}
										alt=""
										class="vela:max-h-24 vela:w-auto vela:rounded vela:border vela:border-[var(--cms-bar-divider)] vela:object-contain vela:bg-[var(--cms-bar-bg-hover)]"
									/>
								{/if}
							</div>
						{:else}
							<label class="vela:flex vela:flex-col vela:gap-1.5">
								<span class={fieldLabelClass}>{fieldSchema.label}</span>
								<Input
									type="text"
									value={stringValue(local[path])}
									placeholder={fieldSchema.placeholder ?? ''}
									oninput={(e) => (local[path] = e.currentTarget.value)}
								/>
							</label>
						{/if}
					{/each}
				</section>
			{/each}
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
