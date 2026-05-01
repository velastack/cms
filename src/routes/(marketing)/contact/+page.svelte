<script lang="ts">
	import { CmsBoolean, CmsLink, CmsRichText, CmsText } from '$lib/index.js';
</script>

<article>
	<h1><CmsText name="hero.title" fallback="Get in touch" /></h1>

	<CmsBoolean name="hero.acceptingWalkins" initial={true}>
		{#snippet children(open)}
			<p class="status" data-open={open}>
				{#if open}
					<span class="dot" aria-hidden="true"></span>
					Currently accepting walk-ins.
				{:else}
					By appointment only this week.
				{/if}
			</p>
		{/snippet}
	</CmsBoolean>

	<CmsRichText
		name="body"
		fallback="<p>We're a small team and we love hearing from our guests. Drop us a line and we'll get back to you within a day.</p>"
	/>

	<CmsBoolean name="emergencyNotice.visible" initial={false}>
		{#snippet children(visible)}
			{#if visible}
				<aside class="notice">
					<strong>Heads up:</strong>
					<CmsText
						name="emergencyNotice.text"
						fallback="Reception desk closed this weekend — please use email."
					/>
				</aside>
			{/if}
		{/snippet}
	</CmsBoolean>

	<div class="actions">
		<CmsLink
			name="cta.book"
			class="btn btn--primary"
			fallback={{ label: 'Book a room', routeId: '/(marketing)/rooms', params: {} }}
		/>
		<CmsLink
			name="cta.about"
			class="btn btn--secondary"
			fallback={{ label: 'About us', routeId: '/(marketing)/about', params: {} }}
		/>
		<CmsLink
			name="cta.email"
			class="btn btn--ghost"
			fallback={{ label: 'Email us', href: 'mailto:hello@example.com' }}
		/>
	</div>
</article>

<style>
	article {
		max-width: 56rem;
		margin: 0 auto;
		padding: 2.5rem 1.25rem;
	}
	.status {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.5rem 0 1.25rem;
		padding: 0.375rem 0.75rem;
		border-radius: 999px;
		font-size: 0.875rem;
		background: rgba(127, 127, 127, 0.08);
		color: #555;
	}
	.status[data-open='true'] {
		background: #e6f7ec;
		color: #176638;
	}
	.status .dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: #2aa66a;
	}
	.notice {
		margin: 1.5rem 0;
		padding: 0.75rem 1rem;
		border-left: 3px solid #d97706;
		background: #fffaf0;
		font-size: 0.95rem;
	}
	.notice strong {
		margin-right: 0.375rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 2rem;
	}
	.actions :global(.btn) {
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		text-decoration: none;
		font-size: 0.95rem;
		border: 1px solid transparent;
	}
	.actions :global(.btn--primary) {
		background: #1f2937;
		color: white;
	}
	.actions :global(.btn--primary:hover) {
		background: #111827;
	}
	.actions :global(.btn--secondary) {
		background: white;
		color: #1f2937;
		border-color: #e5e7eb;
	}
	.actions :global(.btn--secondary:hover) {
		background: #f9fafb;
	}
	.actions :global(.btn--ghost) {
		color: #1f2937;
	}
	.actions :global(.btn--ghost:hover) {
		text-decoration: underline;
	}
</style>
