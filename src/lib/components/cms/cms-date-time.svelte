<script lang="ts" module>
	import type { Snippet } from 'svelte';

	export type CmsDateTimeMode = 'datetime' | 'date' | 'time';

	export type CmsDateTimeProps = {
		name: string;
		scope?: string;
		/**
		 * `'datetime'` (default) → `<input type="datetime-local">`, stores
		 * `YYYY-MM-DDTHH:MM`. `'date'` → `<input type="date">`, stores
		 * `YYYY-MM-DD`. `'time'` → `<input type="time">`, stores `HH:MM`.
		 * Storage is the raw native input string — no timezone conversion.
		 */
		mode?: CmsDateTimeMode;
		fallback?: string;
		/** Per-item override used by structured components. */
		value?: unknown;
		children?: Snippet<[string]>;
	};
</script>

<script lang="ts">
	import { useCmsField } from './use-cms-field.svelte.js';

	let { name, scope, mode = 'datetime', fallback, value, children }: CmsDateTimeProps = $props();

	const field = useCmsField(
		() => ({ name, scope, value }),
		(raw): string | undefined => {
			if (raw === undefined) return fallback;
			return typeof raw === 'string' ? raw : '';
		}
	);

	const current = $derived(field.current);
</script>

{#if field.editable && field.ref}
	{#await import('./cms-date-time-editable.svelte') then { default: Editable }}
		<Editable scope={field.ref} {name} {mode} initial={current} />
	{/await}
{:else if current && children}
	{@render children(current)}
{:else if current}
	{current}
{:else if field.raw === null}
	<!-- cleared by the editor -->
{:else if children}
	{@render children('')}
{:else}
	<span class="cms-missing" data-cms-name={name} data-cms-scope={field.ref?.scopeId ?? '?'}
		>{name}</span
	>
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
