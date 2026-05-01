<script lang="ts" module>
	export type CmsLinkValue = {
		label?: string;
		/** Raw URL — used when `routeId` is absent. */
		href?: string;
		/** SvelteKit route id, e.g. `/blog/[slug]`. Resolved at render time. */
		routeId?: string;
		params?: Record<string, string>;
		newTab?: boolean;
	};

	export type CmsLinkRenderProps = { label: string; href: string; newTab: boolean };
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { getCmsScope, type CmsPayload } from './scope.js';
	import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';
	import { resolveRouteUrl } from '../admin-bar/resolve-route.js';

	type Props = {
		name: string;
		fallback?: CmsLinkValue;
		value?: unknown;
		class?: string;
		children?: Snippet<[CmsLinkRenderProps]>;
	};
	let { name, fallback, value, class: className, children }: Props = $props();

	const scope = getCmsScope();
	const ref = $derived<CmsScopeRef | null>(
		scope
			? { scopeId: scope.scopeId, routeId: scope.routeId, params: scope.params }
			: null
	);

	const resolved = $derived.by(() => {
		if (value !== undefined) return value;
		if (cmsStore.isEditing && ref && cmsStore.hasDraft(ref, name)) {
			return cmsStore.getValue(ref, name);
		}
		if (ref && cmsStore.hasOverlay(ref, name)) {
			return cmsStore.getOverlayValue(ref, name);
		}
		const cms = page.data.cms as CmsPayload | undefined;
		return scope ? cms?.docs[scope.scopeId]?.[name] : undefined;
	});

	const link = $derived.by((): CmsLinkValue => {
		if (resolved && typeof resolved === 'object') return resolved as CmsLinkValue;
		return fallback ?? {};
	});

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
	const editable = $derived(cmsStore.isEditing && value === undefined && !!ref);
</script>

{#if editable && ref}
	{#await import('./cms-link-editable.svelte') then { default: Editable }}
		<Editable scope={ref} {name} initial={link} {className} {children} />
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
{:else}
	<span class="cms-missing" data-cms-name={name} data-cms-scope={scope?.scopeId ?? '?'}>
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
