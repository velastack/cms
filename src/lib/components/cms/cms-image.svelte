<script lang="ts" module>
	export { normalizeImage } from '../../core/shapes/image.js';
	export type { CmsImageValue } from '../../core/shapes/image.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { useCmsField } from './use-cms-field.svelte.js';
	import { normalizeImage, type CmsImageValue } from '../../core/shapes/image.js';

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
