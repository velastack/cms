<script lang="ts">
	import {
		cms,
		CmsBoolean,
		CmsContact,
		CmsDateTime,
		CmsFaq,
		CmsHours,
		CmsSteps,
		CmsText
	} from '#lib/index.js';
	import Explainer from '../../_components/explainer.svelte';
	import Marker from '../../_components/marker.svelte';

	const schemaType = $derived(
		(cms.site.seo as { schemaType?: string } | undefined)?.schemaType ?? 'not set'
	);

	const formatDate = (raw: string) => {
		const d = new Date(`${raw}T00:00`);
		return Number.isNaN(d.getTime())
			? raw
			: d.toLocaleDateString('en-IE', { day: 'numeric', month: 'long' });
	};
</script>

<Explainer
	title="Contact: shared values, edited where they show"
	notes={[
		{
			title: 'Contact details',
			body: 'The same value as the footer. This page reads it with `scope="root"`, so editing the address here changes the footer on every page.',
			component: 'CmsContact'
		},
		{
			title: 'Opening hours',
			body: 'Also shared with the footer. The view gives grouped rows, dated exceptions and whether reception is open right now, in the visitor’s locale.',
			component: 'CmsHours'
		},
		{
			title: 'A notice you can switch off',
			body: 'A boolean decides whether the notice shows at all, and a date sets the “until”. Neither component renders markup of its own.',
			component: 'CmsBoolean'
		},
		{
			title: 'Steps',
			body: 'Numbered steps with rich-text bodies.',
			component: 'CmsSteps'
		},
		{
			title: 'FAQ',
			body: 'Questions with rich-text answers. `toFaqPage` builds the schema.org data.',
			component: 'CmsFaq'
		}
	]}
	beyond={[
		{
			title: 'Site options',
			body: `Site → Site Options holds values that never render on a page, like the schema.org business type (currently \`${schemaType}\`) and the default share image.`
		}
	]}
>
	<p>
		Contact details and opening hours appear in the footer of every page and in full here. They are
		one value in the root layout, edited from wherever they appear.
	</p>
</Explainer>

<div class="wrap">
	<h1><CmsText name="hero.title" /></h1>

	<CmsBoolean name="notice.visible">
		{#snippet children(visible)}
			{#if visible}
				<p class="notice">
					<Marker n={3} />
					<span>
						<CmsText name="notice.text" />, until
						<CmsDateTime name="notice.until" mode="date">
							{#snippet children(value)}{formatDate(value)}{/snippet}
						</CmsDateTime>.
					</span>
				</p>
			{/if}
		{/snippet}
	</CmsBoolean>

	<div class="cols">
		<section>
			<Marker n={1} />
			<CmsContact name="contact" scope="root">
				{#snippet children(c)}
					<h2>{c.name}</h2>
					<address>
						{#each c.formattedAddress as line, i (i)}{line}<br />{/each}
					</address>
					{#if c.mapsHref}
						<p><a href={c.mapsHref} target="_blank" rel="noopener">{c.labels.directions}</a></p>
					{/if}
					<dl>
						{#each c.phones as p (p.id)}
							<dt>{p.label}</dt>
							<dd><a href={p.href}>{p.number}</a></dd>
						{/each}
						{#each c.emails as e (e.id)}
							<dt>{e.label}</dt>
							<dd><a href={e.href}>{e.address}</a></dd>
						{/each}
						{#if c.whatsappHref}
							<dt>WhatsApp</dt>
							<dd><a href={c.whatsappHref}>{c.labels.whatsapp}</a></dd>
						{/if}
					</dl>
				{/snippet}
			</CmsContact>
		</section>

		<section>
			<Marker n={2} />
			<CmsHours name="hours" scope="root">
				{#snippet children(h)}
					<h2>
						Reception
						<span class="status" data-open={h.isOpenNow}>{h.status}</span>
					</h2>
					<dl>
						{#each h.rows as row (row.id)}
							<dt>{row.days}</dt>
							<dd>{row.text}</dd>
						{/each}
						{#each h.exceptionRows as e (e.id)}
							<dt>{e.dateText}</dt>
							<dd>{e.label}: {e.text}</dd>
						{/each}
					</dl>
					{#if h.note}<p class="muted">{h.note}</p>{/if}
				{/snippet}
			</CmsHours>
		</section>
	</div>

	<section>
		<h2><CmsText name="gettingHere.heading" /> <Marker n={4} /></h2>
		<CmsSteps name="gettingHere">
			{#snippet children(items)}
				<ol class="steps">
					{#each items as s (s.id)}
						<li><strong>{s.title}</strong>{@html s.body}</li>
					{/each}
				</ol>
			{/snippet}
		</CmsSteps>
	</section>

	<section>
		<h2>Questions <Marker n={5} /></h2>
		<CmsFaq name="faq">
			{#snippet children(items)}
				{#each items as q (q.id)}
					<details>
						<summary>{q.question}</summary>
						{@html q.answer}
					</details>
				{/each}
			{/snippet}
		</CmsFaq>
	</section>
</div>

<style>
	.wrap {
		max-width: 64rem;
		margin: 0 auto;
		padding: 1rem 1.25rem 3rem;
	}
	h1 {
		margin: 1rem 0;
		font-size: 2.75rem;
	}
	h2 {
		font-size: 1.5rem;
	}
	section {
		margin-top: 2rem;
	}
	.notice {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		padding: 0.875rem 1rem;
		border-left: 3px solid #c58b1b;
		background: #fbf3e2;
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 2rem;
	}
	.cols section {
		padding: 1.5rem;
		background: var(--paper);
	}
	.cols h2 {
		margin-top: 0.5rem;
	}
	address {
		font-style: normal;
		line-height: 1.5;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.375rem 1.25rem;
		margin: 1rem 0 0;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
	}
	a {
		color: var(--sea);
	}
	.status {
		margin-left: 0.5rem;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		font-family: var(--sans);
		font-size: 0.75rem;
		font-weight: 400;
		vertical-align: middle;
		background: rgba(127, 127, 127, 0.12);
	}
	.status[data-open='true'] {
		background: #e6f2ec;
		color: #1d6b45;
	}
	.muted {
		color: var(--muted);
	}
	.steps {
		padding-left: 1.25rem;
	}
	.steps li {
		margin-bottom: 0.75rem;
	}
	.steps :global(p) {
		margin: 0.125rem 0 0;
		color: var(--muted);
	}
	details {
		padding: 0.875rem 0;
		border-bottom: 1px solid var(--line);
	}
	summary {
		cursor: pointer;
		font-weight: 600;
	}
	details :global(p) {
		margin: 0.5rem 0 0;
	}
</style>
