<script lang="ts">
	import { resolve } from '$app/paths';
	import { CmsEntries, CmsText } from '#lib/index.js';
	import Explainer from '../../_components/explainer.svelte';
	import Marker from '../../_components/marker.svelte';

	const eur = (n: unknown) =>
		typeof n === 'number'
			? n.toLocaleString('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
			: '–';
	const beds: Record<string, string> = { king: 'King bed', queen: 'Queen bed', twin: 'Twin beds' };
</script>

<Explainer
	title="Rooms: pages editors create"
	notes={[
		{
			title: 'Listing the pages',
			body: '`CmsEntries` lists every published page under `/rooms/[slug]` along with its metadata: price, guests and bed type here. Nothing on this list is hard-coded.',
			component: 'CmsEntries'
		}
	]}
	beyond={[
		{
			title: 'Creating a room',
			body: 'In the admin bar, choose Site → New Page…. `page.cms.ts` next to the route says the page is creatable, which fields the dialog asks for, and how a title becomes a slug.'
		},
		{
			title: 'Typed metadata',
			body: 'The same `page.cms.ts` adds `price_per_night`, `max_guests` and `bed_type` to each room’s metadata, edited in the SEO & Metadata panel next to the title and description.'
		},
		{
			title: 'Renamed and retired rooms',
			body: 'The Balcony Suite used to live at /rooms/suite-1. That URL is stored as a redirect, so it answers with a 308 instead of a 404, and the static build writes a redirect page for it. The Boathouse was retired as gone: `npm run dev` answers /rooms/the-boathouse with 410, and the static build doesn’t write it.'
		}
	]}
>
	<p>
		A list of pages, not a list stored in one field. Each room has its own URL, SEO metadata and
		content, and editors add new rooms from the admin bar without touching code.
	</p>
	<p><a href="/rooms/suite-1">Try the old /rooms/suite-1 link</a>.</p>
</Explainer>

<div class="wrap">
	<h1><CmsText name="intro.title" /></h1>
	<p class="lede"><CmsText name="intro.body" /></p>

	<Marker n={1} />
	<table>
		<thead>
			<tr><th>Room</th><th>Sleeps</th><th>Beds</th><th>From</th></tr>
		</thead>
		<tbody>
			<CmsEntries routeId="/(marketing)/rooms/[slug]">
				{#snippet children(entry)}
					<tr>
						<td>
							<a href={resolve('/(marketing)/rooms/[slug]', entry.params)}>
								{entry.metadata.title ?? entry.params.slug}
							</a>
							<small>{entry.metadata.description ?? ''}</small>
						</td>
						<td>{entry.metadata.max_guests ?? '–'}</td>
						<td>{beds[entry.metadata.bed_type as string] ?? '–'}</td>
						<td>{eur(entry.metadata.price_per_night)}</td>
					</tr>
				{/snippet}
				{#snippet fallback()}
					<tr><td colspan="4">No rooms published yet.</td></tr>
				{/snippet}
			</CmsEntries>
		</tbody>
	</table>
</div>

<style>
	.wrap {
		max-width: 64rem;
		margin: 0 auto;
		padding: 1rem 1.25rem 3rem;
	}
	h1 {
		margin: 1rem 0 0.25rem;
		font-size: 2.5rem;
	}
	.lede {
		margin: 0 0 2rem;
		color: var(--muted);
		font-size: 1.125rem;
	}
	table {
		width: 100%;
		margin-top: 0.5rem;
		border-collapse: collapse;
		background: var(--paper);
	}
	th,
	td {
		padding: 0.875rem 1rem;
		border-bottom: 1px solid var(--line);
		text-align: left;
		vertical-align: top;
	}
	th {
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted);
	}
	td a {
		font-family: var(--serif);
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--sea);
	}
	td small {
		display: block;
		color: var(--muted);
	}
	@media (max-width: 40rem) {
		th:nth-child(3),
		td:nth-child(3) {
			display: none;
		}
	}
</style>
