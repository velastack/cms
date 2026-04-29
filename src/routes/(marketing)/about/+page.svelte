<script lang="ts">
	import { CmsRichText, CmsText } from '$lib/index.js';
</script>

<article>
	<h1><CmsText name="hero.title" fallback="About us" /></h1>
	<CmsRichText
		name="body"
		fallback="<p>This page is rendered through the marketing layout, so its CMS fields live under the <code>page:/(marketing)/about</code> scope.</p>"
	/>
</article>

<style>
	article {
		max-width: 56rem;
		margin: 0 auto;
		padding: 2.5rem 1.25rem;
	}
</style>
