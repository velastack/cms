<script lang="ts">
	import { CmsFaq, toFaqPage } from '$lib/index.js';
	import { demoFaq } from '../../_components/demo-content.js';
</script>

<h1>CmsFaq</h1>
<p class="lede">Questions with rich answers, and the FAQPage node a template puts in its head.</p>

<CmsFaq name="faq" fallback={demoFaq}>
	{#snippet children(items)}
		{#each items as q (q.id)}
			<details>
				<summary>{q.question}</summary>
				{@html q.answer}
			</details>
		{/each}
		<h2>FAQPage</h2>
		<pre>{JSON.stringify(toFaqPage({ v: 1, items }), null, 2)}</pre>
	{/snippet}
</CmsFaq>
