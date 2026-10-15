<!--
	Mounted by the (marketing) and (guest) layouts and by the playground page.
	The brand and nav are `scope="root"`, so all three share them. The tagline
	has no `scope`, so each mount point stores its own.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { CmsNav, CmsText, isActive } from '#lib/index.js';
</script>

<header class="header">
	<a href="/" class="brand">
		<span class="name"><CmsText name="branding.name" scope="root" /></span>
		<span class="tagline"><CmsText name="header.tagline" /></span>
	</a>
	<nav>
		<CmsNav name="nav.primary" scope="root">
			{#snippet children(items)}
				<div class="links">
					{#each items as item (item.id)}
						<a
							href={item.href}
							target={item.newTab ? '_blank' : undefined}
							aria-current={isActive(item, page.url) ? 'page' : undefined}
						>
							{item.label}
						</a>
					{/each}
				</div>
			{/snippet}
		</CmsNav>
	</nav>
</header>

<style>
	.header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem 1.5rem;
		max-width: 64rem;
		margin: 0 auto;
		padding: 1rem 1.25rem;
	}
	.brand {
		display: flex;
		flex-direction: column;
		color: inherit;
		text-decoration: none;
	}
	.name {
		font-family: var(--serif);
		font-size: 1.375rem;
		font-weight: 600;
	}
	.tagline {
		font-size: 0.8rem;
		color: var(--muted);
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1.25rem;
	}
	nav a {
		color: inherit;
		text-decoration: none;
		font-size: 0.95rem;
	}
	nav a:hover,
	nav a[aria-current='page'] {
		color: var(--sea);
		text-decoration: underline;
		text-underline-offset: 0.3em;
	}
</style>
