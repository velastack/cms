<script lang="ts">
	import { CmsText } from '$lib/components/cms/index.js';
</script>

<header class="header">
	<a href="/" class="brand">
		<CmsText name="header.title" fallback="Velastack" />
	</a>
	<nav>
		<a href="/about">About</a>
		<a href="/rooms/suite-1">Suite 1</a>
		<a href="/rooms/suite-2">Suite 2</a>
		<a href="/dashboard">Dashboard</a>
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
	nav a:hover {
		text-decoration: underline;
	}
</style>
