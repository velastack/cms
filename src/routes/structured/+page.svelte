<script lang="ts">
	import { CmsText } from '$lib/index.js';

	const components = [
		['nav', 'CmsNav', 'Navigation with one level of children; links pick a page or a URL.'],
		[
			'hours',
			'CmsHours',
			'Week grid, split shifts, exceptions; rows, today and open-now derived per locale.'
		],
		[
			'contact',
			'CmsContact',
			'Address, phones, emails, WhatsApp, directions; hrefs and JSON-LD derived.'
		],
		['social-links', 'CmsSocialLinks', 'Ordered profiles with a platform for the icon set.'],
		['collection', 'CmsCollection', 'Rooms, services, tours: one list, sliced on the home page.'],
		['team', 'CmsTeam', 'People with a portrait, rich bio and profile links.'],
		['testimonials', 'CmsTestimonials', 'Quotes with rating, source and date; Review JSON-LD.'],
		['pricing', 'CmsPricing', 'Tiers with a feature checklist and a call to action.'],
		['faq', 'CmsFaq', 'Questions with rich answers; FAQPage JSON-LD.'],
		['presets', 'Presets', 'CmsStats, CmsSteps, CmsTimeline, CmsGallery, CmsLogos, CmsSchedule.']
	] as const;
</script>

<h1><CmsText name="structured.title" fallback="Structured editing" /></h1>
<p class="lede">
	Every component below reads one versioned value, opens a popover editor in edit mode and hands the
	typed view to a snippet. Business name from the root layout, edited here through
	<code>scope="root"</code>:
	<strong><CmsText name="branding.name" scope="root" fallback="Velastack CMS" /></strong>
</p>

<ul class="cards">
	{#each components as [slug, name, blurb] (slug)}
		<li class="card">
			<h3><a href={`/structured/${slug}`}>{name}</a></h3>
			<p>{blurb}</p>
		</li>
	{/each}
</ul>
