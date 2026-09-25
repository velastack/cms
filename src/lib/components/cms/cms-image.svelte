<script lang="ts" module>
	/**
	 * Stored shape of an image slot. Seeds and fallbacks may pass a bare URL
	 * string; it is normalized to `{ url }`. A cleared slot stores `url: null`.
	 */
	export type CmsImageValue = {
		url?: string | null;
		alt?: string | null;
		width?: number;
		height?: number;
	};

	export const normalizeImage = (raw: unknown): CmsImageValue => {
		if (raw == null) return {};
		if (typeof raw === 'string') return { url: raw };
		if (typeof raw === 'object' && !Array.isArray(raw)) {
			const r = raw as Record<string, unknown>;
			const out: CmsImageValue = {};
			if (typeof r.url === 'string') out.url = r.url;
			if (typeof r.alt === 'string') out.alt = r.alt;
			if (typeof r.width === 'number') out.width = r.width;
			if (typeof r.height === 'number') out.height = r.height;
			return out;
		}
		return {};
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { useCmsField } from './use-cms-field.svelte.js';

	type Props = {
		name: string;
		scope?: string;
		/** Fallback alt text used when the stored value has no `alt`. */
		alt?: string;
		/** A URL, or a full `{ url, alt }` value. */
		fallback?: string | CmsImageValue;
		value?: unknown;
		children?: Snippet;
	};

	let { name, scope, alt = '', fallback, value, children }: Props = $props();

	const field = useCmsField(
		() => ({ name, scope, value }),
		(raw): CmsImageValue => (raw === undefined ? normalizeImage(fallback) : normalizeImage(raw))
	);

	const src = $derived(field.current.url ?? '');
	const altText = $derived(field.current.alt ?? alt);
</script>

{#if field.editable && field.ref}
	{#await import('./cms-image-editable.svelte') then { default: Editable }}
		<Editable scope={field.ref} {name} initial={field.current} fallbackAlt={alt} />
	{/await}
{:else if src}
	<img class="cms-image" {src} alt={altText} />
{:else if field.raw === null}
	<!-- cleared by the editor -->
{:else if children}
	{@render children()}
{:else}
	<span class="cms-missing" data-cms-name={name} data-cms-scope={field.ref?.scopeId ?? '?'}>
		{name}
	</span>
{/if}

<style>
	.cms-image {
		max-width: 100%;
		height: auto;
	}
	.cms-missing {
		display: inline-block;
		padding: 0.5rem 0.75rem;
		border: 1px dashed rgba(127, 127, 127, 0.6);
		border-radius: 0.25rem;
		font-family: ui-monospace, monospace;
		font-size: 0.85em;
		color: rgba(127, 127, 127, 0.9);
	}
</style>
