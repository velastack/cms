<script lang="ts">
	import { CmsRichText, CmsText } from '$lib/index.js';
</script>

<section class="hero">
	<h1><CmsText name="welcome.title" fallback="Welcome to the test harness" /></h1>
	<CmsRichText
		name="welcome.body"
		fallback="<p>Pick a section: marketing pages live under <code>/about</code> and <code>/rooms/[slug]</code>; the app shell lives under <code>/dashboard</code>.</p>"
	/>
</section>

<style>
	.hero {
		max-width: 56rem;
		margin: 0 auto;
		padding: 3rem 1.25rem;
	}
</style>
