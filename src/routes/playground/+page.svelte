<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		CmsBoolean,
		CmsCollection,
		CmsContact,
		CmsDateTime,
		CmsEntries,
		CmsFaq,
		CmsGallery,
		CmsHours,
		CmsImage,
		CmsLink,
		CmsLogos,
		CmsMarkdown,
		CmsNav,
		CmsNumber,
		CmsPricing,
		CmsRichText,
		CmsSchedule,
		CmsSocialLinks,
		CmsStats,
		CmsSteps,
		CmsTeam,
		CmsTestimonials,
		CmsText,
		CmsTimeline,
		formatCollectionPrice,
		isActive,
		scheduleByDay,
		toFaqPage,
		toOpeningHoursSpecification,
		toPostalAddress,
		toReview
	} from '#lib/index.js';
	import Header from '../_components/header.svelte';
	import Example from './example.svelte';
	import {
		demoCollection,
		demoContact,
		demoFaq,
		demoGallery,
		demoHours,
		demoLogos,
		demoPricing,
		demoPrimaryNav,
		demoSchedule,
		demoSocial,
		demoStats,
		demoSteps,
		demoTeam,
		demoTestimonials,
		demoTimeline
	} from '../_components/demo-content.js';

	const groups = [
		{
			title: 'Primitives',
			items: [
				'CmsText',
				'CmsRichText',
				'CmsMarkdown',
				'CmsImage',
				'CmsBoolean',
				'CmsNumber',
				'CmsDateTime',
				'CmsLink'
			]
		},
		{ title: 'Pages', items: ['CmsEntries'] },
		{
			title: 'Structured',
			items: [
				'CmsNav',
				'CmsHours',
				'CmsContact',
				'CmsSocialLinks',
				'CmsCollection',
				'CmsTeam',
				'CmsTestimonials',
				'CmsPricing',
				'CmsFaq'
			]
		},
		{
			title: 'List presets',
			items: ['CmsStats', 'CmsSteps', 'CmsTimeline', 'CmsGallery', 'CmsLogos', 'CmsSchedule']
		}
	];

	const formatDateTime = (raw: string): string => {
		const d = new Date(raw);
		if (Number.isNaN(d.getTime())) return raw;
		return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
	};
</script>

<Header />

<div class="playground">
	<nav class="toc" aria-label="Components">
		{#each groups as group (group.title)}
			<p class="toc-group">{group.title}</p>
			<ul>
				{#each group.items as item (item)}
					<li><a href={`#${item}`}>{item}</a></li>
				{/each}
			</ul>
		{/each}
	</nav>

	<div class="content">
		<h1>Playground</h1>
		<p class="lede">
			Every CMS component with a working example. Each one shows its fallback until a value is
			stored.
			{#if page.data.editable}
				Sign in and switch to edit mode to edit any of them in place.
			{:else}
				Run <code>npm run dev</code> to edit them in place.
			{/if}
			The <a href="/">hotel demo</a> shows them working together on real pages.
		</p>

		<h2>Primitives</h2>

		<Example id="CmsText" title="<CmsText>">
			{#snippet description()}
				A single line of plain text, edited inline. Enter is blocked. The value comes from <code
					>fallback</code
				> or from the children's text.
			{/snippet}
			<h4 class="demo-heading"><CmsText name="text.heading" fallback="A plain-text heading" /></h4>
			<p><CmsText name="text.body">Fallback taken from the children.</CmsText></p>
		</Example>

		<Example id="CmsRichText" title="<CmsRichText>">
			{#snippet description()}
				A block of HTML edited with a formatting toolbar: headings, bold, italic, lists, quotes and
				links.
			{/snippet}
			<CmsRichText
				name="richText"
				fallback="<p>Rich text supports <strong>bold</strong>, <em>italic</em> and <a href='#CmsRichText'>links</a>.</p><ul><li>Bulleted lists</li><li>and numbered ones</li></ul><blockquote><p>Block quotes too.</p></blockquote>"
			/>
		</Example>

		<Example id="CmsMarkdown" title="<CmsMarkdown>">
			{#snippet description()}
				Stores Markdown source and renders it with <code>marked</code>. Use it where editors prefer
				writing Markdown to a toolbar.
			{/snippet}
			<CmsMarkdown
				name="markdown"
				fallback={`## Amenities

- High-speed Wi-Fi
- Walk-in shower
- **Locally roasted** coffee

Ask the front desk for our [neighborhood guide](#CmsMarkdown).`}
			/>
		</Example>

		<Example id="CmsImage" title="<CmsImage>">
			{#snippet description()}
				An image picked from the media library, with alt text. The fallback is a URL or a <code
					>{'{ url, alt }'}</code
				> value.
			{/snippet}
			<CmsImage name="image" alt="A hotel room" fallback="/cms-media/suite1-hero.jpg" />
		</Example>

		<Example id="CmsBoolean" title="<CmsBoolean>">
			{#snippet description()}
				A toggle with no markup of its own. The snippet gets the current value, so it can show, hide
				or switch content. Defaults to <code>initial</code>.
			{/snippet}
			<CmsBoolean name="boolean" initial={true}>
				{#snippet children(open)}
					<p class="pill" data-on={open}>
						{open ? 'Currently accepting walk-ins' : 'By appointment only'}
					</p>
				{/snippet}
			</CmsBoolean>
		</Example>

		<Example id="CmsNumber" title="<CmsNumber>">
			{#snippet description()}
				A number with optional <code>min</code>, <code>max</code>, <code>step</code> and
				<code>integer</code>. Without a snippet it renders the bare number. With one, the template
				formats it.
			{/snippet}
			<dl class="rows">
				<dt>Sleeps</dt>
				<dd><CmsNumber name="number.capacity" fallback={2} min={1} integer /></dd>
				<dt>Nightly rate</dt>
				<dd>
					<CmsNumber name="number.rate" fallback={180} min={0}>
						{#snippet children(amount)}{amount.toLocaleString('en-US', {
								style: 'currency',
								currency: 'EUR'
							})}{/snippet}
					</CmsNumber>
				</dd>
			</dl>
		</Example>

		<Example id="CmsDateTime" title="<CmsDateTime>">
			{#snippet description()}
				A date, a time or both, stored as the native input string with no timezone conversion. Set
				<code>mode</code> to <code>datetime</code> (the default), <code>date</code> or
				<code>time</code>.
			{/snippet}
			<dl class="rows">
				<dt>datetime</dt>
				<dd>
					<CmsDateTime name="dateTime.opening" fallback="2026-05-10T10:00">
						{#snippet children(value)}{formatDateTime(value)}{/snippet}
					</CmsDateTime>
				</dd>
				<dt>date</dt>
				<dd><CmsDateTime name="dateTime.date" mode="date" fallback="2026-12-24" /></dd>
				<dt>time</dt>
				<dd><CmsDateTime name="dateTime.checkIn" mode="time" fallback="15:00" /></dd>
			</dl>
		</Example>

		<Example id="CmsLink" title="<CmsLink>">
			{#snippet description()}
				A label plus a destination: a page on the site (by route, so it follows renames) or any URL,
				optionally in a new tab. It renders an <code>&lt;a&gt;</code>, or hands the label and href
				to a snippet.
			{/snippet}
			<div class="actions">
				<CmsLink
					name="link.page"
					class="btn btn--primary"
					fallback={{ label: 'Book a room', routeId: '/(marketing)/rooms', params: {} }}
				/>
				<CmsLink
					name="link.url"
					class="btn"
					fallback={{ label: 'GitHub', href: 'https://github.com/velastack/cms', newTab: true }}
				/>
				<CmsLink
					name="link.snippet"
					fallback={{ label: 'Email us', href: 'mailto:hello@example.com' }}
				>
					{#snippet children({ label, href })}
						<a class="btn btn--ghost" {href}>{label} →</a>
					{/snippet}
				</CmsLink>
			</div>
		</Example>

		<h2>Pages</h2>

		<Example id="CmsEntries" title="<CmsEntries>">
			{#snippet description()}
				Lists the pages created under a creatable route, with their params and metadata. Editors add
				them from the admin bar. The <code>fallback</code> snippet renders when there are none.
			{/snippet}
			<ul class="entries">
				<CmsEntries routeId="/(marketing)/rooms/[slug]">
					{#snippet children(entry)}
						<li>
							<a href={resolve('/(marketing)/rooms/[slug]', entry.params)}>
								{entry.metadata.title ?? entry.params.slug}
							</a>
						</li>
					{/snippet}
					{#snippet fallback()}
						<li class="muted">No rooms yet.</li>
					{/snippet}
				</CmsEntries>
			</ul>
		</Example>

		<h2>Structured</h2>
		<p class="lede">
			These are headless. Each reads one value, opens a popover editor in edit mode and passes a
			typed view to the <code>children</code> snippet. The template owns the markup.
		</p>

		<Example id="CmsNav" title="<CmsNav>">
			{#snippet description()}
				Navigation with one level of children. Each link points at a page or a URL. Items arrive
				with a resolved <code>href</code>, and <code>isActive(item, url)</code> marks the current page.
			{/snippet}
			<CmsNav name="nav" fallback={demoPrimaryNav}>
				{#snippet children(items)}
					<ul>
						{#each items as item (item.id)}
							<li>
								<a
									href={item.href}
									target={item.newTab ? '_blank' : undefined}
									aria-current={isActive(item, page.url) ? 'page' : undefined}>{item.label}</a
								>
								{#if item.children.length}
									<ul>
										{#each item.children as child (child.id)}
											<li><a href={child.href}>{child.label}</a></li>
										{/each}
									</ul>
								{/if}
							</li>
						{/each}
					</ul>
				{/snippet}
			</CmsNav>
		</Example>

		<Example id="CmsHours" title="<CmsHours>">
			{#snippet description()}
				Opening hours: a week grid with split shifts, dated exceptions and a note. The view includes
				grouped rows, today's hours and whether the place is open now, all in the visitor's locale.
			{/snippet}
			<CmsHours name="hours" fallback={demoHours}>
				{#snippet children(h)}
					<p>
						<strong>{h.today.label}:</strong>
						{h.today.text}
						<span class="pill" data-on={h.isOpenNow}>{h.status}</span>
					</p>
					<dl class="rows">
						{#each h.rows as row (row.id)}
							<dt>{row.days}</dt>
							<dd class:muted={row.closed}>{row.text}</dd>
						{/each}
					</dl>
					{#if h.exceptionRows.length}
						<h4>Exceptions</h4>
						<dl class="rows">
							{#each h.exceptionRows as e (e.id)}
								<dt>{e.dateText}</dt>
								<dd>{e.label}{e.label ? ' · ' : ''}{e.text}</dd>
							{/each}
						</dl>
					{/if}
					{#if h.note}<p class="muted">{h.note}</p>{/if}
					<details>
						<summary>openingHoursSpecification</summary>
						<pre>{JSON.stringify(toOpeningHoursSpecification(h), null, 2)}</pre>
					</details>
				{/snippet}
			</CmsHours>
		</Example>

		<Example id="CmsContact" title="<CmsContact>">
			{#snippet description()}
				Address, phones, emails, WhatsApp and map location. The view adds <code>tel:</code>,
				<code>mailto:</code>, WhatsApp and directions links, plus the address formatted line by
				line.
			{/snippet}
			<CmsContact name="contact" fallback={demoContact}>
				{#snippet children(c)}
					{#if c.name}<h4>{c.name}</h4>{/if}
					{#if c.hasAddress}
						<address>
							{#each c.formattedAddress as line, i (i)}{line}<br />{/each}
						</address>
						{#if c.mapsHref}
							<p><a href={c.mapsHref} target="_blank" rel="noopener">{c.labels.directions}</a></p>
						{/if}
					{/if}
					<dl class="rows">
						{#each c.phones as p (p.id)}
							<dt>{p.label}</dt>
							<dd><a href={p.href}>{p.number}</a></dd>
						{/each}
						{#each c.emails as e (e.id)}
							<dt>{e.label}</dt>
							<dd><a href={e.href}>{e.address}</a></dd>
						{/each}
					</dl>
					{#if c.whatsappHref}<p><a href={c.whatsappHref}>{c.labels.whatsapp}</a></p>{/if}
					<details>
						<summary>PostalAddress</summary>
						<pre>{JSON.stringify(toPostalAddress(c), null, 2)}</pre>
					</details>
				{/snippet}
			</CmsContact>
		</Example>

		<Example id="CmsSocialLinks" title="<CmsSocialLinks>">
			{#snippet description()}
				Social profiles in order. Each has a <code>platform</code> the template maps to its icon
				set, and a <code>name</code> that is the custom label or the platform's name.
			{/snippet}
			<CmsSocialLinks name="social" fallback={demoSocial}>
				{#snippet children(items)}
					<p class="inline-list">
						{#each items as item (item.id)}
							<a href={item.url} target="_blank" rel="me noopener">{item.name}</a>
						{/each}
					</p>
				{/snippet}
			</CmsSocialLinks>
		</Example>

		<Example id="CmsCollection" title="<CmsCollection>">
			{#snippet description()}
				A list of rooms, services or tours: image, summary, price, details, tags and a link. The
				<code>limit</code>, <code>featured</code> and <code>tag</code> props slice it, so a home page
				and a list page can share one value.
			{/snippet}
			<CmsCollection name="collection" fallback={demoCollection}>
				{#snippet children(items)}
					<ul class="cards">
						{#each items as item (item.id)}
							<li class="card">
								{#if item.image?.url}<img src={item.image.url} alt={item.image.alt ?? ''} />{/if}
								<h4>
									{#if item.href}<a href={item.href}>{item.title}</a>{:else}{item.title}{/if}
								</h4>
								<p>{item.summary}</p>
								{#if item.price.amount !== null}
									<p><strong>{formatCollectionPrice(item.price, 'en-IE')}</strong></p>
								{/if}
								{#if item.features.length}<p class="muted">{item.features.join(' · ')}</p>{/if}
							</li>
						{/each}
					</ul>
				{/snippet}
			</CmsCollection>
			<h4>Same value, <code>featured</code> and <code>limit={'{1}'}</code></h4>
			<CmsCollection name="collection" fallback={demoCollection} featured limit={1}>
				{#snippet children(items)}
					<p>{items.map((item) => item.title).join(', ')}</p>
				{/snippet}
			</CmsCollection>
		</Example>

		<Example id="CmsTeam" title="<CmsTeam>">
			{#snippet description()}
				People, each with a photo from the media library, a role, a rich-text bio, contact details
				and profile links.
			{/snippet}
			<CmsTeam name="team" fallback={demoTeam}>
				{#snippet children(members)}
					<ul class="cards">
						{#each members as m (m.id)}
							<li class="card">
								{#if m.photo?.url}<img src={m.photo.url} alt={m.photo.alt ?? m.name} />{/if}
								<h4>{m.name}</h4>
								<p class="muted">{m.role}</p>
								{@html m.bio}
								{#if m.email}<p><a href={`mailto:${m.email}`}>{m.email}</a></p>{/if}
							</li>
						{/each}
					</ul>
				{/snippet}
			</CmsTeam>
		</Example>

		<Example id="CmsTestimonials" title="<CmsTestimonials>">
			{#snippet description()}
				Quotes with an author, rating, source and date. <code>toReview</code> turns each one into a schema.org
				Review.
			{/snippet}
			<CmsTestimonials name="testimonials" fallback={demoTestimonials}>
				{#snippet children(items)}
					<ul class="cards">
						{#each items as t (t.id)}
							<li class="card">
								{#if t.rating}
									<p aria-label={`${t.rating} of 5`}>
										{'★'.repeat(t.rating)}{'☆'.repeat(5 - t.rating)}
									</p>
								{/if}
								<blockquote>{@html t.quote}</blockquote>
								<p>
									<strong>{t.author}</strong>{#if t.role}, {t.role}{/if}
								</p>
								{#if t.source.label}<p class="muted">via {t.source.label}</p>{/if}
							</li>
						{/each}
					</ul>
					<details>
						<summary>Review</summary>
						<pre>{JSON.stringify(
								items.map((t) => toReview(t)),
								null,
								2
							)}</pre>
					</details>
				{/snippet}
			</CmsTestimonials>
		</Example>

		<Example id="CmsPricing" title="<CmsPricing>">
			{#snippet description()}
				Price tiers with a feature checklist, an optional badge and a call to action. Prices are
				formatted in the visitor's locale. A custom price shows an editable label such as "Ask us".
			{/snippet}
			<CmsPricing name="pricing" fallback={demoPricing}>
				{#snippet children(tiers)}
					<ul class="cards">
						{#each tiers as tier (tier.id)}
							<li class="card" class:highlighted={tier.highlighted}>
								{#if tier.badge}<p class="muted">{tier.badge}</p>{/if}
								<h4>{tier.name}</h4>
								<p><strong>{tier.priceText}</strong></p>
								<p>{tier.description}</p>
								<ul class="features">
									{#each tier.features as f (f.id)}
										<li class:excluded={!f.included}>{f.text}</li>
									{/each}
								</ul>
								{#if tier.href}<p><a href={tier.href}>{tier.cta?.label || 'Book'}</a></p>{/if}
							</li>
						{/each}
					</ul>
				{/snippet}
			</CmsPricing>
		</Example>

		<Example id="CmsFaq" title="<CmsFaq>">
			{#snippet description()}
				Questions with rich-text answers. <code>toFaqPage</code> builds the FAQPage structured data.
			{/snippet}
			<CmsFaq name="faq" fallback={demoFaq}>
				{#snippet children(items)}
					{#each items as q (q.id)}
						<details class="faq">
							<summary>{q.question}</summary>
							{@html q.answer}
						</details>
					{/each}
					<details>
						<summary>FAQPage</summary>
						<pre>{JSON.stringify(toFaqPage({ v: 1, items }), null, 2)}</pre>
					</details>
				{/snippet}
			</CmsFaq>
		</Example>

		<h2>List presets</h2>
		<p class="lede">
			Lists with a fixed item shape. They work like the structured components. A new item shape
			means a new preset.
		</p>

		<Example id="CmsStats" title="<CmsStats>">
			{#snippet description()}
				Key figures, each with a value, a label and an optional note.
			{/snippet}
			<CmsStats name="stats" fallback={demoStats}>
				{#snippet children(items)}
					<ul class="stats">
						{#each items as s (s.id)}
							<li>
								<strong>{s.value}</strong>
								<span>{s.label}</span>
								{#if s.note}<span class="muted">{s.note}</span>{/if}
							</li>
						{/each}
					</ul>
				{/snippet}
			</CmsStats>
		</Example>

		<Example id="CmsSteps" title="<CmsSteps>">
			{#snippet description()}
				Numbered steps of a process, each with a title, a rich-text body and an optional image.
			{/snippet}
			<CmsSteps name="steps" fallback={demoSteps}>
				{#snippet children(items)}
					<ol>
						{#each items as s (s.id)}
							<li><strong>{s.title}</strong>{@html s.body}</li>
						{/each}
					</ol>
				{/snippet}
			</CmsSteps>
		</Example>

		<Example id="CmsTimeline" title="<CmsTimeline>">
			{#snippet description()}
				Dated milestones, each with a title, a rich-text body and an optional image.
			{/snippet}
			<CmsTimeline name="timeline" fallback={demoTimeline}>
				{#snippet children(items)}
					<dl class="rows">
						{#each items as t (t.id)}
							<dt>{t.date}</dt>
							<dd><strong>{t.title}</strong>{@html t.body}</dd>
						{/each}
					</dl>
				{/snippet}
			</CmsTimeline>
		</Example>

		<Example id="CmsGallery" title="<CmsGallery>">
			{#snippet description()}
				Images from the media library, each with a caption.
			{/snippet}
			<CmsGallery name="gallery" fallback={demoGallery}>
				{#snippet children(items)}
					<ul class="cards">
						{#each items as g (g.id)}
							<li>
								<figure>
									<img src={g.image?.url} alt={g.image?.alt ?? g.caption} />
									<figcaption class="muted">{g.caption}</figcaption>
								</figure>
							</li>
						{/each}
					</ul>
				{/snippet}
			</CmsGallery>
		</Example>

		<Example id="CmsLogos" title="<CmsLogos>">
			{#snippet description()}
				Partner, press or client logos, each with a name and an optional link.
			{/snippet}
			<CmsLogos name="logos" fallback={demoLogos}>
				{#snippet children(items)}
					<ul class="logos">
						{#each items as l (l.id)}
							<li>
								{#if l.href}
									<a href={l.href}><img src={l.image?.url} alt={l.name} /></a>
								{:else}
									<img src={l.image?.url} alt={l.name} />
								{/if}
							</li>
						{/each}
					</ul>
				{/snippet}
			</CmsLogos>
		</Example>

		<Example id="CmsSchedule" title="<CmsSchedule>">
			{#snippet description()}
				Recurring events, each with a day, time, title, location and body. <code>scheduleByDay</code
				>
				groups them by day.
			{/snippet}
			<CmsSchedule name="schedule" fallback={demoSchedule}>
				{#snippet children(items)}
					{#each scheduleByDay({ v: 1, items }) as day (day.day)}
						<h4>{day.day}</h4>
						<dl class="rows">
							{#each day.items as s (s.id)}
								<dt>{s.time}</dt>
								<dd>
									<strong>{s.title}</strong>{#if s.location}&nbsp;· {s.location}{/if}
									{@html s.body}
								</dd>
							{/each}
						</dl>
					{/each}
				{/snippet}
			</CmsSchedule>
		</Example>
	</div>
</div>

<style>
	.playground {
		display: grid;
		grid-template-columns: 12rem minmax(0, 1fr);
		gap: 3rem;
		max-width: 72rem;
		margin: 0 auto;
		padding: 2.5rem 1.25rem 4rem;
	}
	.toc {
		position: sticky;
		top: 1.5rem;
		align-self: start;
		max-height: calc(100vh - 3rem);
		overflow-y: auto;
		font-size: 0.875rem;
	}
	.toc-group {
		margin: 1.25rem 0 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #777;
	}
	.toc-group:first-child {
		margin-top: 0;
	}
	.toc ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.toc a {
		display: block;
		padding: 0.2rem 0;
		color: #333;
		text-decoration: none;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.8rem;
	}
	.toc a:hover {
		text-decoration: underline;
	}
	@media (max-width: 48rem) {
		.playground {
			grid-template-columns: minmax(0, 1fr);
			gap: 1.5rem;
		}
		.toc {
			position: static;
			max-height: none;
		}
		.toc ul {
			display: flex;
			flex-wrap: wrap;
			gap: 0 0.875rem;
		}
	}

	h1 {
		margin: 0 0 0.5rem;
	}
	h2 {
		margin: 3rem 0 1.25rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid rgba(127, 127, 127, 0.25);
		font-size: 1.35rem;
	}
	.lede {
		margin: 0 0 2rem;
		color: #555;
		line-height: 1.5;
	}
	.content :global(code) {
		font-size: 0.875em;
	}

	/* Example markup. Templates own this; it is only here to make the demos legible. */
	.content h4,
	.demo-heading {
		margin: 1rem 0 0.5rem;
		font-size: 1rem;
	}
	.demo-heading {
		margin-top: 0;
		font-size: 1.25rem;
	}
	.muted {
		color: #777;
		font-size: 0.875rem;
	}
	.pill {
		display: inline-block;
		margin: 0 0 0 0.375rem;
		padding: 0.1rem 0.6rem;
		border-radius: 999px;
		font-size: 0.8rem;
		background: rgba(127, 127, 127, 0.12);
		color: #555;
	}
	p.pill {
		margin: 0;
	}
	.pill[data-on='true'] {
		background: #e6f7ec;
		color: #176638;
	}
	.rows {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.375rem 1.25rem;
		margin: 0;
	}
	.rows dt {
		color: #777;
	}
	.rows dd {
		margin: 0;
	}
	.rows dd :global(p) {
		margin: 0.125rem 0 0;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
		gap: 1rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.card {
		padding: 1rem;
		border: 1px solid rgba(127, 127, 127, 0.25);
		border-radius: 0.5rem;
	}
	.card.highlighted {
		outline: 2px solid #1f2937;
	}
	.card h4 {
		margin: 0.5rem 0 0.25rem;
	}
	.card p,
	.card :global(p) {
		margin: 0.25rem 0;
		font-size: 0.9rem;
	}
	.cards img {
		width: 100%;
		height: auto;
		border-radius: 0.25rem;
	}
	.card blockquote {
		margin: 0.5rem 0;
		font-style: italic;
	}
	.features {
		padding-left: 1.1rem;
		font-size: 0.9rem;
	}
	.features .excluded {
		color: #999;
		text-decoration: line-through;
	}
	figure {
		margin: 0;
	}
	.inline-list {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin: 0;
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 2.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.stats li {
		display: flex;
		flex-direction: column;
	}
	.stats strong {
		font-size: 2rem;
		line-height: 1.1;
	}
	.logos {
		display: flex;
		flex-wrap: wrap;
		gap: 1.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.logos img {
		height: 3rem;
		width: auto;
	}
	.entries {
		margin: 0;
		padding-left: 1.25rem;
	}
	.faq {
		padding: 0.5rem 0;
		border-bottom: 1px solid rgba(127, 127, 127, 0.2);
	}
	.faq summary {
		cursor: pointer;
		font-weight: 500;
	}
	details:not(.faq) {
		margin-top: 1rem;
		font-size: 0.85rem;
	}
	details:not(.faq) summary {
		cursor: pointer;
		color: #777;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	}
	pre {
		padding: 0.75rem;
		background: #f4f4f5;
		border-radius: 0.375rem;
		font-size: 0.8rem;
		overflow: auto;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.actions :global(.btn) {
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 1rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		color: #1f2937;
		background: white;
		font-size: 0.95rem;
		text-decoration: none;
	}
	.actions :global(.btn--primary) {
		border-color: transparent;
		background: #1f2937;
		color: white;
	}
	.actions :global(.btn--ghost) {
		border-color: transparent;
	}
	.actions :global(.btn--ghost:hover) {
		text-decoration: underline;
	}
</style>
