<script lang="ts">
	/**
	 * Company: the business's profile, stored in the site tree at `company`
	 * and saved like Site Options. One location shows its fields directly;
	 * a second one adds a picker above Location and Hours. A profile the
	 * host manages is shown read-only.
	 */
	import type { Tree } from '../../core/path.js';
	import { moveItem, newItemId, setIn } from '../../core/structured.js';
	import {
		cmsCompany,
		companyManagedBy,
		emptyLocation,
		COMPANY_LOCATION_FIELDS,
		type CmsCompanyValue
	} from '../../core/shapes/company.js';
	import { DEFAULT_HOURS_LABELS } from '../../core/shapes/hours.js';
	import { cmsStore } from '../cms/cms-store.svelte.js';
	import FieldsForm from './fields-form.svelte';
	import HoursWeek from './hours-week.svelte';
	import PanelFooter from './panel-footer.svelte';
	import PanelHeader from './panel-header.svelte';
	import Panel from './panel.svelte';
	import ReorderButtons from './reorder-buttons.svelte';
	import { Button } from './ui/button/index.js';
	import * as Tabs from './ui/tabs/index.js';

	type Props = { onClose: () => void; onSave: () => void | Promise<void> };
	let { onClose, onSave }: Props = $props();

	const TABS = ['Business', 'Contact', 'Location', 'Hours', 'Social'];
	/** Location fields that only matter once there are several. */
	const MULTI_ONLY = ['name', 'phones', 'emails', 'whatsapp'];

	const manager = $derived(companyManagedBy(cmsStore.site));

	const stored = (): CmsCompanyValue => cmsCompany.normalize(cmsStore.getSiteValue('company'));
	const initial = (): Tree => {
		const value = stored();
		// The form always has a location to fill in; a blank one is dropped on save.
		if (value.locations.length === 0) value.locations = [emptyLocation(newItemId())];
		return value;
	};

	// The raw form state; every change replaces it with a new object.
	let draft = $state.raw<Tree>(initial());
	let tab = $state(TABS[0]);
	let selected = $state(0);

	const value = $derived(cmsCompany.normalize(draft));
	const locations = $derived(draft.locations as Tree[]);
	const multi = $derived(locations.length > 1);
	const index = $derived(Math.min(selected, locations.length - 1));

	const tabFields = $derived(
		tab === 'Location' || tab === 'Hours'
			? COMPANY_LOCATION_FIELDS.filter(
					(f) => f.group === tab && (multi || tab === 'Hours' || !MULTI_ONLY.includes(f.key))
				)
			: cmsCompany.fields.filter((f) => f.group === tab)
	);

	const setLocations = (next: Tree[]) => (draft = { ...draft, locations: next });
	const setLocation = (next: Tree) =>
		setLocations(locations.map((l, i) => (i === index ? next : l)));
	const addLocation = () => {
		setLocations([...locations, emptyLocation(newItemId())]);
		selected = locations.length - 1;
	};
	const removeLocation = (i: number) => {
		setLocations(locations.filter((_, j) => j !== i));
		selected = 0;
	};
	const moveLocation = (from: number, to: number) => {
		setLocations(moveItem(locations, from, to));
		selected = to;
	};

	const isBlank = (location: CmsCompanyValue['locations'][number]): boolean =>
		JSON.stringify({ ...location, id: '' }) === JSON.stringify(emptyLocation(''));

	const handleSave = async () => {
		const next = cmsCompany.normalize(draft);
		if (next.locations.length === 1 && isBlank(next.locations[0])) next.locations = [];
		if (JSON.stringify(next) !== JSON.stringify(stored())) cmsStore.setSiteValue('company', next);
		await onSave();
	};

	const selectClass =
		'vela:flex vela:h-9 vela:flex-1 vela:min-w-0 vela:rounded-md vela:border vela:border-[var(--cms-bar-divider)]' +
		' vela:bg-[var(--cms-bar-bg-hover)] vela:px-3 vela:py-1 vela:text-[13px] vela:text-bar-text' +
		' vela:focus:outline-none vela:focus:ring-2 vela:focus:ring-[var(--cms-accent)]';
</script>

<Panel ariaLabel="Company" {onClose}>
	<PanelHeader title="Company" {onClose}>
		{#snippet subtitle()}
			{#if manager}
				<span class="vela:text-[12px] vela:text-bar-text-secondary">
					Managed by {manager.by}
					{#if manager.url}
						·
						<a
							class="vela:underline vela:text-bar-text"
							href={manager.url}
							target="_blank"
							rel="noopener"
						>
							Open in {manager.by}
						</a>
					{/if}
				</span>
			{/if}
		{/snippet}
	</PanelHeader>

	<form
		class="vela:overflow-y-auto vela:px-4 vela:pb-4 vela:flex vela:flex-col vela:gap-3"
		onsubmit={(e) => {
			e.preventDefault();
			if (!manager) handleSave();
		}}
	>
		<Tabs.Root bind:value={tab}>
			<Tabs.List aria-label="Sections">
				{#each TABS as name (name)}
					<Tabs.Trigger value={name}>{name}</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</Tabs.Root>

		{#if multi && (tab === 'Location' || tab === 'Hours')}
			<div class="vela:flex vela:items-center vela:gap-2">
				<select
					class={selectClass}
					aria-label="Location"
					value={String(index)}
					onchange={(e) => (selected = Number(e.currentTarget.value))}
				>
					{#each value.locations as location, i (location.id)}
						<option value={String(i)}>{location.name || `Location ${i + 1}`}</option>
					{/each}
				</select>
				{#if !manager}
					<ReorderButtons
						{index}
						count={locations.length}
						label="location"
						onMove={moveLocation}
						onRemove={removeLocation}
					/>
				{/if}
			</div>
		{/if}

		<fieldset
			disabled={!!manager}
			class="vela:m-0 vela:p-0 vela:border-0 vela:min-w-0 vela:flex vela:flex-col vela:gap-3"
		>
			{#if tab === 'Location' || tab === 'Hours'}
				{#if tab === 'Hours'}
					<HoursWeek
						days={value.locations[index].hours.days}
						closedLabel={DEFAULT_HOURS_LABELS.closed}
						onChange={(days) => setLocation(setIn(locations[index], 'hours.days', days))}
					/>
				{/if}
				<FieldsForm fields={tabFields} value={locations[index]} onChange={setLocation} />
				{#if tab === 'Location' && !manager}
					<Button variant="outline" size="pill" class="vela:self-start" onclick={addLocation}>
						+ Add location
					</Button>
				{/if}
			{:else}
				<FieldsForm fields={tabFields} value={draft} onChange={(next) => (draft = next)} />
			{/if}
		</fieldset>
	</form>

	{#if !manager}
		<PanelFooter class="vela:justify-end">
			<div class="vela:flex vela:items-center vela:gap-1.5">
				<Button variant="ghost" size="pill" onclick={onClose}>Cancel</Button>
				<Button size="pill" onclick={handleSave}>Save</Button>
			</div>
		</PanelFooter>
	{/if}
</Panel>
