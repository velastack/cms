<script lang="ts">
	import { CmsRichText, CmsText } from '$lib/components/cms/index.js';
</script>

<h1><CmsText name="welcome.title" fallback="Dashboard" /></h1>
<CmsRichText
	name="body"
	fallback="<p>This page sits inside the <code>(app)</code> layout group, which reuses <code>Header.svelte</code> with a different scope.</p>"
/>
