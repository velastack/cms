<script lang="ts">
	/**
	 * Site Options: the few project-wide values that do not render on the
	 * page — the schema.org type, the default share image, which locales are
	 * enabled. Anything a visitor sees (hours, contact, navigation, branding)
	 * lives in the root layout scope and is edited where it renders.
	 *
	 * The schema comes from `createCms({ site })`; storage is one
	 * non-localised tree per project.
	 */
	import { page } from '$app/state';
	import { cmsStore } from '$lib/components/cms/cms-store.svelte.js';
	import type { CmsPayload, SiteFieldSchema, SiteSchema } from '$lib/components/cms/scope.js';
	import FieldInput from './field-input.svelte';
	import PanelFooter from './panel-footer.svelte';
	import PanelHeader from './panel-header.svelte';
	import Panel from './panel.svelte';
	import { Button } from './ui/button/index.js';

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
	// `cmsStore.siteDraft` until Save fires (matches seo-panel.svelte).
	let local = $state<Record<string, unknown>>({});

	$effect(() => {
		const next: Record<string, unknown> = {};
		for (const { path } of allFieldPaths) next[path] = persistedValue(path);
		local = next;
	});

	const handleSave = async () => {
		for (const { path } of allFieldPaths) {
			const v = local[path];
			if (v !== persistedValue(path)) cmsStore.setSiteValue(path, v);
		}
		await onSave();
	};
</script>

<Panel ariaLabel="Site options" {onClose}>
	<PanelHeader title="Site options" {onClose}>
		{#snippet subtitle()}
			<span class="vela:text-[12px] vela:text-bar-text-secondary">
				settings that don't render on the page
			</span>
		{/snippet}
	</PanelHeader>

	<form
		class="vela:overflow-y-auto vela:px-4 vela:pb-4 vela:flex vela:flex-col vela:gap-5"
		onsubmit={(e) => {
			e.preventDefault();
			handleSave();
		}}
	>
		{#if sections.length === 0}
			<p class="vela:text-[13px] vela:text-bar-text-tertiary vela:py-2">
				No site options have been declared. Pass a <code>site</code> schema to
				<code>createCms()</code> to add fields here. Text that renders on the page belongs in the root
				layout, edited in place.
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
						<FieldInput
							type={fieldSchema.type}
							label={fieldSchema.label}
							placeholder={fieldSchema.placeholder}
							values={fieldSchema.values ?? []}
							value={local[path]}
							onChange={(v) => (local[path] = v)}
							{endpoint}
						/>
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
