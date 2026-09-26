<script lang="ts">
	import { page } from '$app/state';
	import { cms, CmsNav, isActive } from '$lib/index.js';
	import { demoPrimaryNav } from './demo-content.js';
</script>

<header class="header">
	<a href="/" class="brand">
		{(cms.site.branding as { name?: string } | undefined)?.name ?? 'Velastack'}
	</a>
	<nav>
		<CmsNav name="nav.primary" scope="root" fallback={demoPrimaryNav}>
			{#snippet children(items)}
				{#each items as item (item.id)}
					<a
						href={item.href}
						target={item.newTab ? '_blank' : undefined}
						aria-current={isActive(item, page.url) ? 'page' : undefined}
					>
						{item.label}
					</a>
				{/each}
			{/snippet}
		</CmsNav>
	</nav>
</header>

<style>
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1.25rem;
		border-bottom: 1px solid rgba(127, 127, 127, 0.25);
	}
	.brand {
		font-weight: 600;
		text-decoration: none;
		color: inherit;
	}
	nav {
		display: flex;
		gap: 1rem;
	}
	nav a {
		color: inherit;
		text-decoration: none;
	}
	nav a:hover,
	nav a[aria-current='page'] {
		text-decoration: underline;
	}
</style>
