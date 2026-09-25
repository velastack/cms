<script lang="ts" generics="T extends Record<string, unknown>">
	/**
	 * The editor every structured component opens: a popover anchored to the
	 * slot (a bottom sheet under 600px, per DESIGN.md §8.2) holding a form
	 * over a local draft, committed to the CMS draft on Done.
	 *
	 * Locales are tabs. The default locale's tab is the component's own form
	 * (`editor` snippet) and owns the structure; every other locale's tab
	 * lists the translatable strings with the default text as reference and
	 * writes only `<name>.$t.<id>.<field>` (see `core/structured.ts`). The
	 * popover opens on the locale the editor is previewing.
	 */
	import { onMount, type Snippet } from 'svelte';
	import { cmsStore } from '../cms/cms-store.svelte.js';
	import type { CmsField } from '../cms/use-cms-field.svelte.js';
	import {
		stripTranslations,
		translatableFields,
		translationPath,
		type Structured,
		type TranslatableField
	} from '../../core/structured.js';
	import CssRoot from './css-root.svelte';
	import PencilIcon from './icons/pencil.svelte';
	import { Button } from './ui/button/index.js';
	import { Input } from './ui/input/index.js';
	import { Textarea } from './ui/textarea/index.js';
	import * as Popover from './ui/popover/index.js';
	import * as Sheet from './ui/sheet/index.js';
	import * as Tabs from './ui/tabs/index.js';

	type Props = {
		field: CmsField<T>;
		schema: Structured<T>;
		/** Human label for the header, e.g. "Opening hours". */
		label: string;
		open?: boolean;
		/** What the visitor sees; rendered in place with the edit affordance. */
		preview: Snippet;
		/** The default-locale form over a local draft. */
		editor: Snippet<[T, (next: T) => void]>;
	};
	let { field, schema, label, open = $bindable(false), preview, editor }: Props = $props();

	const locales = $derived(cmsStore.locales);
	const defaultLocale = $derived(cmsStore.defaultLocale);
	const otherLocales = $derived(locales.filter((l) => l !== defaultLocale));

	// Local drafts: structure for the default locale, strings per other locale.
	let draft = $state<T>({} as T);
	let translations = $state<Record<string, Record<string, string>>>({});
	let tab = $state('');

	const reset = () => {
		draft = structuredClone($state.snapshot(field.current)) as T;
		translations = {};
		tab = locales.includes(cmsStore.activeLocale) ? cmsStore.activeLocale : defaultLocale;
	};

	$effect(() => {
		if (open) reset();
	});

	$effect(() => {
		if (open && tab && tab !== defaultLocale) void cmsStore.loadLocaleOverlay(tab);
	});

	const update = (next: T) => {
		draft = next;
	};

	const fields = $derived<TranslatableField[]>(translatableFields(draft, schema));

	/** Stored translation for a field in `locale`, unless edited in this session. */
	const translationValue = (locale: string, f: TranslatableField): string => {
		const local = translations[locale]?.[`${f.id}.${f.field}`];
		if (local !== undefined) return local;
		const stored = field.getIn(locale, `$t.${f.id}.${f.field}`);
		return typeof stored === 'string' ? stored : '';
	};
	const setTranslation = (locale: string, f: TranslatableField, value: string) => {
		translations = {
			...translations,
			[locale]: { ...(translations[locale] ?? {}), [`${f.id}.${f.field}`]: value }
		};
	};

	const done = () => {
		field.set(stripTranslations($state.snapshot(draft)), defaultLocale);
		for (const [locale, strings] of Object.entries(translations)) {
			for (const [key, value] of Object.entries(strings)) {
				const dot = key.indexOf('.');
				const id = key.slice(0, dot);
				const f = key.slice(dot + 1);
				field.setAt(translationPath('', id, f).slice(1), value === '' ? null : value, locale);
			}
		}
		open = false;
	};

	const clear = () => {
		field.set(null, defaultLocale);
		open = false;
	};

	// Under 600px the popover becomes a bottom sheet (DESIGN.md §8.2).
	let isMobile = $state(false);
	onMount(() => {
		const mq = window.matchMedia('(max-width: 600px)');
		const sync = () => (isMobile = mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});
</script>

{#snippet body()}
	<div class="vela:flex vela:items-center vela:justify-between vela:px-4 vela:pt-3.5 vela:pb-2">
		<div class="vela:flex vela:items-baseline vela:gap-2 vela:min-w-0">
			<h2 class="vela:text-[14px] vela:font-semibold vela:m-0">{label}</h2>
			<span class="vela:font-mono vela:text-[11px] vela:text-bar-text-tertiary vela:truncate">
				{field.name}
			</span>
		</div>
	</div>

	{#if otherLocales.length > 0}
		<Tabs.Root bind:value={tab} class="vela:px-4">
			<Tabs.List aria-label="Language">
				{#each locales as locale (locale)}
					<Tabs.Trigger value={locale} class="vela:font-mono vela:uppercase">{locale}</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</Tabs.Root>
	{/if}

	<div
		class="vela:overflow-y-auto vela:max-h-[60vh] vela:px-4 vela:py-3 vela:flex vela:flex-col vela:gap-3"
	>
		{#if tab === defaultLocale || otherLocales.length === 0}
			{@render editor(draft, update)}
		{:else}
			{#if fields.length === 0}
				<p class="vela:text-[12px] vela:text-bar-text-tertiary vela:m-0">
					Nothing to translate yet. Add content in
					<span class="vela:font-mono vela:uppercase">{defaultLocale}</span> first.
				</p>
			{:else}
				<p class="vela:text-[11px] vela:text-bar-text-tertiary vela:m-0">
					Structure is shared with
					<span class="vela:font-mono vela:uppercase">{defaultLocale}</span>; only the text
					translates. Blank fields show the original.
				</p>
				{#each fields as f (`${f.id}.${f.field}`)}
					<label class="vela:flex vela:flex-col vela:gap-1">
						<span class="vela:text-[12px] vela:text-bar-text-secondary vela:truncate">
							{f.source}
						</span>
						{#if f.source.length > 80 || f.source.includes('<')}
							<Textarea
								value={translationValue(tab, f)}
								placeholder={f.source}
								oninput={(e) => setTranslation(tab, f, e.currentTarget.value)}
							/>
						{:else}
							<Input
								type="text"
								value={translationValue(tab, f)}
								placeholder={f.source}
								oninput={(e) => setTranslation(tab, f, e.currentTarget.value)}
							/>
						{/if}
					</label>
				{/each}
			{/if}
		{/if}
	</div>

	<div
		class="vela:flex vela:items-center vela:justify-between vela:px-4 vela:py-2.5 vela:border-t vela:border-[var(--cms-bar-divider)] vela:text-[12px] vela:text-bar-text-tertiary"
	>
		<Button variant="ghost" size="pill" onclick={clear}>Clear</Button>
		<div class="vela:flex vela:items-center vela:gap-1.5">
			<Button variant="ghost" size="pill" onclick={() => (open = false)}>Cancel</Button>
			<Button size="pill" onclick={done}>Done</Button>
		</div>
	</div>
{/snippet}

<CssRoot>
	<span class="cms-structured-edit" data-open={open ? '' : undefined} data-cms-name={field.name}>
		<span class="cms-structured-edit__preview">{@render preview()}</span>
		{#if isMobile}
			<Sheet.Root bind:open>
				<Sheet.Trigger class="cms-structured-edit__trigger" aria-label={`Edit ${label}`}>
					<PencilIcon class="vela:size-3" />
					{label}
				</Sheet.Trigger>
				<Sheet.Content side="bottom" class="vela:gap-0" showCloseButton={false}>
					{@render body()}
				</Sheet.Content>
			</Sheet.Root>
		{:else}
			<Popover.Root bind:open>
				<Popover.Trigger class="cms-structured-edit__trigger" aria-label={`Edit ${label}`}>
					<PencilIcon class="vela:size-3" />
					{label}
				</Popover.Trigger>
				<Popover.Content class="vela:w-[420px] vela:max-w-[calc(100vw-2rem)]">
					{@render body()}
				</Popover.Content>
			</Popover.Root>
		{/if}
	</span>
</CssRoot>

<style>
	.cms-structured-edit {
		position: relative;
		display: block;
		border-radius: 0.125rem;
		outline: 1px dashed rgba(127, 127, 127, 0.6);
		outline-offset: 4px;
	}
	.cms-structured-edit:hover,
	.cms-structured-edit:focus-within,
	.cms-structured-edit[data-open] {
		outline: 2px solid var(--cms-accent, #534ab7);
		outline-offset: 4px;
	}
	.cms-structured-edit__preview {
		display: contents;
	}
	:global(.cms-structured-edit__trigger) {
		position: absolute;
		top: -0.5rem;
		right: -0.5rem;
		z-index: 40;
		display: none;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.5rem;
		background: var(--cms-bar-bg, #1f1f1f);
		color: var(--cms-bar-text, #f5f5f5);
		border: 1px solid var(--cms-bar-divider, #3a3a3a);
		border-radius: 999px;
		cursor: pointer;
		font: inherit;
		font-size: 0.6875rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
		line-height: 1.4;
		white-space: nowrap;
	}
	.cms-structured-edit:hover :global(.cms-structured-edit__trigger),
	.cms-structured-edit:focus-within :global(.cms-structured-edit__trigger),
	.cms-structured-edit[data-open] :global(.cms-structured-edit__trigger) {
		display: inline-flex;
	}
</style>
