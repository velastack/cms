<script lang="ts" module>
	import type { Snippet } from 'svelte';

	export type CmsDateTimeMode = 'datetime' | 'date' | 'time';

	export type CmsDateTimeProps = {
		name: string;
		/**
		 * `'datetime'` (default) → `<input type="datetime-local">`, stores
		 * `YYYY-MM-DDTHH:MM`. `'date'` → `<input type="date">`, stores
		 * `YYYY-MM-DD`. `'time'` → `<input type="time">`, stores `HH:MM`.
		 * Storage is the raw native input string — no timezone conversion.
		 */
		mode?: CmsDateTimeMode;
		fallback?: string;
		/** Per-item override used by `CmsRepeater`. */
		value?: unknown;
		children?: Snippet<[string]>;
	};
</script>

<script lang="ts">
	import { getCmsScope } from './scope.js';
	import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';

	let { name, mode = 'datetime', fallback, value, children }: CmsDateTimeProps = $props();

	const scope = getCmsScope();
	const ref = $derived<CmsScopeRef | null>(
		scope ? { scopeId: scope.scopeId, routeId: scope.routeId, params: scope.params } : null
	);

	const resolved = $derived.by(() => {
		if (value !== undefined) return value;
		return ref ? cmsStore.getValue(ref, name) : undefined;
	});

	const current = $derived(typeof resolved === 'string' ? resolved : fallback);
	const editable = $derived(cmsStore.isEditing && value === undefined && !!ref);
</script>

{#if editable && ref}
	{#await import('./cms-date-time-editable.svelte') then { default: Editable }}
		<Editable scope={ref} {name} {mode} initial={current} />
	{/await}
{:else if current && children}
	{@render children(current)}
{:else if current}
	{current}
{:else if children}
	{@render children('')}
{:else}
	<span class="cms-missing" data-cms-name={name} data-cms-scope={scope?.scopeId ?? '?'}>{name}</span>
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
