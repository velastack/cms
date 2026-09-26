<script lang="ts">
	/**
	 * A link field inside a structured editor: a page from the site or an
	 * external URL, plus "open in a new tab". `value` is a `CmsLinkValue`
	 * or `null`; `onChange(null)` clears it.
	 */
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import type { CmsLinkValue } from '../../core/shapes/link.js';
	import { fetchPageOptions, pageOptionValue, type PageOption } from './page-options.js';
	import { Input } from './ui/input/index.js';
	import { Checkbox } from './ui/checkbox/index.js';

	type Props = {
		value: CmsLinkValue | null;
		onChange: (next: CmsLinkValue | null) => void;
		label?: string;
	};
	let { value, onChange, label }: Props = $props();

	const endpoint = $derived(page.data.cms?.endpoint ?? '/api/cms');
	const selectClass =
		'vela:flex vela:h-9 vela:w-full vela:rounded-md vela:border vela:border-[var(--cms-bar-divider)]' +
		' vela:bg-[var(--cms-bar-bg-hover)] vela:px-3 vela:py-1 vela:text-[13px] vela:text-bar-text' +
		' vela:focus:outline-none vela:focus:ring-2 vela:focus:ring-[var(--cms-accent)]';

	let mode = $state<'page' | 'url'>(
		untrack(() => (value?.href && !value.routeId ? 'url' : 'page'))
	);
	let options = $state<PageOption[] | null>(null);
	$effect(() => {
		if (mode === 'page' && options === null) {
			void fetchPageOptions(endpoint).then((o) => (options = o));
		}
	});

	const selected = $derived(
		value?.routeId ? pageOptionValue(value.routeId, value.params ?? {}) : ''
	);
	const newTab = $derived(value?.newTab === true);

	const emit = (next: CmsLinkValue) => {
		onChange(next.href || next.routeId ? next : null);
	};
	const choosePage = (key: string) => {
		const opt = options?.find((o) => o.value === key);
		if (!opt) return emit({ newTab });
		emit({ routeId: opt.routeId, params: opt.params, newTab });
	};
	const setUrl = (href: string) => emit({ href: href.trim(), newTab });
	const setNewTab = (checked: boolean) => {
		if (value) emit({ ...value, newTab: checked });
	};
</script>

<div class="vela:flex vela:flex-col vela:gap-1.5">
	<div class="vela:flex vela:items-center vela:justify-between">
		<span class="vela:text-[12px] vela:text-bar-text-secondary">{label ?? 'Link'}</span>
		<span
			class="vela:inline-flex vela:rounded-md vela:border vela:border-[var(--cms-bar-divider)] vela:p-0.5 vela:text-[11px]"
			role="radiogroup"
			aria-label="Link type"
		>
			{#each [['page', 'Page'], ['url', 'URL']] as const as [key, name] (key)}
				<button
					type="button"
					role="radio"
					aria-checked={mode === key}
					class="vela:rounded vela:px-2 vela:py-0.5 vela:cursor-pointer vela:text-bar-text-secondary aria-checked:vela:bg-[var(--cms-bar-bg-hover)] aria-checked:vela:text-bar-text"
					onclick={() => (mode = key)}
				>
					{name}
				</button>
			{/each}
		</span>
	</div>
	{#if mode === 'page'}
		<select
			class={selectClass}
			value={selected}
			onchange={(e) => choosePage(e.currentTarget.value)}
		>
			<option value="">{options === null ? 'Loading…' : '— No link —'}</option>
			{#each options ?? [] as opt (opt.value)}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
	{:else}
		<Input
			type="url"
			value={value?.href ?? ''}
			placeholder="https://…"
			oninput={(e) => setUrl(e.currentTarget.value)}
		/>
	{/if}
	<label
		class="vela:flex vela:items-center vela:gap-2 vela:text-[12px] vela:text-bar-text-secondary"
	>
		<Checkbox checked={newTab} onCheckedChange={(c) => setNewTab(c === true)} disabled={!value} />
		Open in a new tab
	</label>
</div>
