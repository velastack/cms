<script lang="ts">
	import { cmsStore, type ReleaseItem } from '$lib/components/cms/cms-store.svelte.js';
	import PanelFooter from './panel-footer.svelte';
	import PanelHeader from './panel-header.svelte';
	import Panel from './panel.svelte';
	import { Badge } from './ui/badge/index.js';
	import { Button } from './ui/button/index.js';

	type Props = {
		currentLocale: string;
		locales: string[];
		onClose: () => void;
		onSelectLocale: (locale: string) => void;
	};
	let { currentLocale, locales, onClose, onSelectLocale }: Props = $props();

	const defaultLocale = $derived(locales[0] ?? '');

	// Group an item to a stable identity across locales: a same-(kind, routeId,
	// params) item in EN and ES describes "the same thing" in both languages.
	const itemKey = (item: ReleaseItem): string => {
		if (item.kind === 'layout') return `layout|${item.routeId}`;
		const keys = Object.keys(item.params).sort();
		const qp = keys.map((k) => `${k}=${item.params[k]}`).join('&');
		return `${item.kind}|${item.routeId}|${qp}`;
	};

	// Per-locale: which "things" (item keys) have edits in this locale.
	const editsByLocale = $derived.by(() => {
		const out = new Map<string, Set<string>>();
		for (const locale of locales) out.set(locale, new Set<string>());
		for (const item of cmsStore.openRelease?.items ?? []) {
			const set = out.get(item.locale);
			if (!set) continue;
			set.add(itemKey(item));
		}
		return out;
	});

	const counts = $derived(cmsStore.workingCopyCountsByLocale);

	type Row = {
		locale: string;
		isDefault: boolean;
		isCurrent: boolean;
		edits: number;
		missing: number;
	};

	const rows = $derived.by<Row[]>(() => {
		const defaultEdits = editsByLocale.get(defaultLocale) ?? new Set<string>();
		return locales.map((locale) => {
			const edits = editsByLocale.get(locale) ?? new Set<string>();
			let missing = 0;
			if (locale !== defaultLocale) {
				for (const k of defaultEdits) {
					if (!edits.has(k)) missing += 1;
				}
			}
			return {
				locale,
				isDefault: locale === defaultLocale,
				isCurrent: locale === currentLocale,
				edits: counts[locale]?.total ?? 0,
				missing
			};
		});
	});
</script>

<Panel ariaLabel="Locales" {onClose}>
	<PanelHeader title="Locales" {onClose}>
		{#snippet subtitle()}
			<span class="vela:text-[12px] vela:text-bar-text-secondary">
				preview locale &amp; translation progress
			</span>
		{/snippet}
	</PanelHeader>

	<div class="vela:overflow-y-auto vela:px-4 vela:pb-2">
		{#if rows.length === 0}
			<p class="vela:text-[13px] vela:text-bar-text-tertiary vela:py-2">
				No locales configured.
			</p>
		{:else}
			<ol class="vela:list-none vela:pl-0 vela:m-0 vela:flex vela:flex-col">
				{#each rows as row (row.locale)}
					<li class="vela:relative vela:py-2.5">
						<div class="vela:flex vela:items-start vela:justify-between vela:gap-3">
							<div class="vela:flex vela:flex-col vela:min-w-0 vela:flex-1">
								<div class="vela:flex vela:items-center vela:gap-2 vela:min-w-0">
									<span
										class="vela:font-mono vela:text-[13px] vela:font-medium vela:text-bar-text"
									>
										{row.locale}
									</span>
									{#if row.isDefault}
										<Badge variant="default" size="sm">default</Badge>
									{/if}
									{#if row.isCurrent}
										<Badge variant="edit" size="sm">previewing</Badge>
									{/if}
								</div>
								<div class="vela:text-[11px] vela:text-bar-text-tertiary vela:mt-0.5">
									{row.edits}
									{row.edits === 1 ? 'edit' : 'edits'}
									{#if !row.isDefault && row.missing > 0}
										· <span class="vela:text-[var(--cms-status-warn-text)]">
											missing {row.missing} from {defaultLocale}
										</span>
									{/if}
								</div>
							</div>
							<div class="vela:flex vela:items-center vela:gap-1.5 vela:shrink-0">
								<Button
									variant="outline"
									size="pill"
									disabled={row.isCurrent}
									onclick={() => onSelectLocale(row.locale)}
								>
									{row.isCurrent ? 'Current' : 'Preview'}
								</Button>
							</div>
						</div>
					</li>
				{/each}
			</ol>
		{/if}
	</div>

	<PanelFooter>
		<span>
			{rows.length}
			{rows.length === 1 ? 'locale' : 'locales'}
		</span>
		<span class="vela:text-bar-text-tertiary">
			Edits ride in one release across all locales.
		</span>
	</PanelFooter>
</Panel>
