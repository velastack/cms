<script lang="ts" module>
	export { normalizeLink } from '../../core/shapes/link.js';
	export type { CmsLinkValue } from '../../core/shapes/link.js';

	export type CmsLinkRenderProps = { label: string; href: string; newTab: boolean };
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { useCmsField } from './use-cms-field.svelte.js';
	import { resolveRouteUrl } from '../admin-bar/resolve-route.js';
	import { normalizeLink, type CmsLinkValue } from '../../core/shapes/link.js';

	type Props = {
		name: string;
		scope?: string;
		fallback?: CmsLinkValue;
		value?: unknown;
		class?: string;
		children?: Snippet<[CmsLinkRenderProps]>;
	};
	let { name, scope, fallback, value, class: className, children }: Props = $props();

	const field = useCmsField(
		() => ({ name, scope, value }),
		(raw): CmsLinkValue => (raw === undefined ? (fallback ?? {}) : normalizeLink(raw))
	);

	const link = $derived(field.current);

	const href = $derived.by(() => {
		if (link.routeId) {
			try {
				return resolveRouteUrl(link.routeId, link.params ?? {});
			} catch {
				return '#';
			}
		}
		return link.href ?? '#';
	});

	const label = $derived(link.label ?? '');
	const newTab = $derived(!!link.newTab);
</script>

{#if field.editable && field.ref}
	{#await import('./cms-link-editable.svelte') then { default: Editable }}
		<Editable scope={field.ref} {name} initial={link} {className} {children} />
	{/await}
{:else if children}
	{@render children({ label, href, newTab })}
{:else if link.href || link.routeId || label}
	<a
		class={className ?? 'cms-link'}
		{href}
		target={newTab ? '_blank' : undefined}
		rel={newTab ? 'noopener noreferrer' : undefined}
	>
		{label || name}
	</a>
{:else if field.raw === null}
	<!-- cleared by the editor -->
{:else}
	<span class="cms-missing" data-cms-name={name} data-cms-scope={field.ref?.scopeId ?? '?'}>
		{name}
	</span>
{/if}

<style>
	.cms-missing {
		display: inline-block;
		padding: 0 0.25rem;
		border: 1px dashed rgba(127, 127, 127, 0.6);
		border-radius: 0.25rem;
		font-family: ui-monospace, monospace;
		font-size: 0.85em;
		color: rgba(127, 127, 127, 0.9);
	}
</style>
