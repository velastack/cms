<script lang="ts" module>
	/**
	 * One input for one field, chosen by `type`. Shared by the SEO panel, the
	 * Site Options panel and the structured editor popovers, so a field looks
	 * and behaves the same wherever it is edited.
	 *
	 * `value` is the raw stored value; `onChange` receives the next value, or
	 * `null` when the input was emptied (an explicit clear — see
	 * `core/structured.ts`).
	 */
	export type FieldInputType =
		| 'text'
		| 'long-string'
		| 'markdown'
		| 'number'
		| 'boolean'
		| 'date'
		| 'datetime'
		| 'time'
		| 'url'
		| 'color'
		| 'image'
		| 'enum';
</script>

<script lang="ts">
	import { page } from '$app/state';
	import ImagesIcon from './icons/images.svelte';
	import { cmsStore, type MediaItem } from '../cms/cms-store.svelte.js';
	import CmsMediaPicker from '../cms/cms-media-picker.svelte';
	import { clickOutside } from './click-outside.js';
	import { Button } from './ui/button/index.js';
	import { Input } from './ui/input/index.js';
	import { Textarea } from './ui/textarea/index.js';
	import { Switch } from './ui/switch/index.js';

	type Props = {
		type: FieldInputType;
		value: unknown;
		onChange: (next: unknown) => void;
		label?: string;
		placeholder?: string;
		/** Options for `enum`, and optional display names. */
		values?: readonly string[];
		names?: Readonly<Record<string, string>>;
		/** Right-aligned text beside the label, e.g. a character counter. */
		hint?: string;
		hintClass?: string;
		/** Images: where the media library lives. Defaults to the payload endpoint. */
		endpoint?: string;
		/** Shown for images with a URL stored on `.url` rather than as a bare string. */
		class?: string;
	};
	let {
		type,
		value,
		onChange,
		label,
		placeholder = '',
		values = [],
		names,
		hint,
		hintClass,
		endpoint,
		class: className
	}: Props = $props();

	const mediaEndpoint = $derived(endpoint ?? page.data.cms?.endpoint ?? '/api/cms');
	const fieldLabelClass = 'vela:text-[12px] vela:text-bar-text-secondary';
	const selectClass =
		'vela:flex vela:h-9 vela:w-full vela:rounded-md vela:border vela:border-[var(--cms-bar-divider)]' +
		' vela:bg-[var(--cms-bar-bg-hover)] vela:px-3 vela:py-1 vela:text-[13px] vela:text-bar-text' +
		' vela:focus:outline-none vela:focus:ring-2 vela:focus:ring-[var(--cms-accent)]';

	const stringValue = $derived(typeof value === 'string' ? value : '');
	const numberValue = $derived(
		typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
	);
	const booleanValue = $derived(value === true);
	// Images may be stored as a bare URL (site options) or `{ url, alt }`.
	const imageUrl = $derived.by(() => {
		if (typeof value === 'string') return value;
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			const u = (value as { url?: unknown }).url;
			return typeof u === 'string' ? u : '';
		}
		return '';
	});
	const imageIsObject = $derived(!!value && typeof value === 'object');
	const imageAlt = $derived(
		imageIsObject && typeof (value as { alt?: unknown }).alt === 'string'
			? ((value as { alt: string }).alt as string)
			: ''
	);

	const setString = (raw: string) => onChange(raw === '' ? null : raw);
	const setNumber = (raw: string) => {
		if (raw === '') return onChange(null);
		const n = Number(raw);
		if (Number.isFinite(n)) onChange(n);
	};
	const setImage = (url: string) => {
		if (imageIsObject) onChange({ ...(value as Record<string, unknown>), url: url || null });
		else onChange(url === '' ? null : url);
	};
	const setAlt = (alt: string) => {
		if (imageIsObject) onChange({ ...(value as Record<string, unknown>), alt: alt || null });
	};

	let libraryOpen = $state(false);
	const onLibrarySelect = (item: MediaItem) => {
		setImage(item.url);
		libraryOpen = false;
	};
	void cmsStore;
</script>

{#if type === 'boolean'}
	<label class="vela:flex vela:items-center vela:justify-between vela:gap-3 {className ?? ''}">
		{#if label}<span class="vela:text-[13px] vela:text-bar-text">{label}</span>{/if}
		<Switch checked={booleanValue} onCheckedChange={(c) => onChange(c)} aria-label={label} />
	</label>
{:else}
	<label class="vela:flex vela:flex-col vela:gap-1.5 {className ?? ''}">
		{#if label || hint}
			<div class="vela:flex vela:items-center vela:justify-between">
				<span class={fieldLabelClass}>{label ?? ''}</span>
				{#if hint}<span class={hintClass}>{hint}</span>{/if}
			</div>
		{/if}
		{#if type === 'long-string' || type === 'markdown'}
			<Textarea
				value={stringValue}
				{placeholder}
				oninput={(e) => setString(e.currentTarget.value)}
			/>
		{:else if type === 'number'}
			<Input
				type="number"
				value={numberValue}
				{placeholder}
				oninput={(e) => setNumber(e.currentTarget.value)}
			/>
		{:else if type === 'date' || type === 'datetime' || type === 'time'}
			<Input
				type={type === 'date' ? 'date' : type === 'time' ? 'time' : 'datetime-local'}
				value={stringValue}
				oninput={(e) => setString(e.currentTarget.value)}
			/>
		{:else if type === 'color'}
			<div class="vela:flex vela:items-center vela:gap-2">
				<input
					type="color"
					value={stringValue || '#000000'}
					oninput={(e) => setString(e.currentTarget.value)}
					class="vela:h-9 vela:w-12 vela:rounded vela:border vela:border-[var(--cms-bar-divider)] vela:bg-[var(--cms-bar-bg-hover)] vela:cursor-pointer"
				/>
				<Input
					type="text"
					value={stringValue}
					placeholder={placeholder || '#1f1f1f'}
					oninput={(e) => setString(e.currentTarget.value)}
				/>
			</div>
		{:else if type === 'url'}
			<Input
				type="url"
				value={stringValue}
				placeholder={placeholder || 'https://…'}
				oninput={(e) => setString(e.currentTarget.value)}
			/>
		{:else if type === 'enum'}
			<select
				class={selectClass}
				value={stringValue}
				onchange={(e) => setString(e.currentTarget.value)}
			>
				<option value="">—</option>
				{#each values as v (v)}
					<option value={v}>{v}</option>
				{/each}
			</select>
		{:else if type === 'image'}
			<div class="vela:relative vela:flex vela:items-center vela:gap-2">
				<Input
					type="url"
					value={imageUrl}
					placeholder={placeholder || 'https://…'}
					oninput={(e) => setImage(e.currentTarget.value)}
				/>
				<Button
					type="button"
					variant="ghost"
					size="pill-icon"
					aria-label="Choose from media library"
					onclick={() => (libraryOpen = !libraryOpen)}
				>
					<ImagesIcon class="vela:size-4" />
				</Button>
				{#if libraryOpen}
					<div
						role="dialog"
						aria-label="Choose from media library"
						class="vela:absolute vela:right-0 vela:top-full vela:mt-1 vela:z-30
							vela:p-2 vela:rounded-md vela:bg-bar-bg
							vela:border vela:border-[var(--cms-bar-divider)]
							vela:shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
						use:clickOutside={() => (libraryOpen = false)}
					>
						<CmsMediaPicker endpoint={mediaEndpoint} onSelect={onLibrarySelect} />
					</div>
				{/if}
			</div>
			{#if imageUrl}
				<img
					src={imageUrl}
					alt=""
					class="vela:max-h-24 vela:w-auto vela:rounded vela:border vela:border-[var(--cms-bar-divider)] vela:object-contain vela:bg-[var(--cms-bar-bg-hover)]"
				/>
				{#if imageIsObject}
					<Input
						type="text"
						value={imageAlt}
						placeholder="Alt text"
						aria-label="Alt text"
						oninput={(e) => setAlt(e.currentTarget.value)}
					/>
				{/if}
			{/if}
		{:else}
			<Input
				type="text"
				value={stringValue}
				{placeholder}
				oninput={(e) => setString(e.currentTarget.value)}
			/>
		{/if}
	</label>
{/if}
