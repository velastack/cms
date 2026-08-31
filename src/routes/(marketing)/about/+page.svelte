<script lang="ts">
	import { CmsText, CmsRichText } from '$lib/index.js';
</script>

<article>
	<h1>
		<CmsText name="metadata.title">About</CmsText>
	</h1>
	<CmsRichText name="body">
		This page is rendered through the marketing layout, so its CMS fields live under the
		<code>page:/(marketing)/about</code> scope.
	</CmsRichText>
</article>

<style>
	article {
		max-width: 56rem;
		margin: 0 auto;
		padding: 2.5rem 1.25rem;
	}
</style>
