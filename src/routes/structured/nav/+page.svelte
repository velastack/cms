<script lang="ts">
	import { page } from '$app/state';
	import { CmsNav, isActive } from '$lib/index.js';
	import { demoFooterNav, demoPrimaryNav } from '../../_components/demo-content.js';
</script>

<h1>CmsNav</h1>
<p class="lede">
	The header's primary navigation, read here from the root layout with <code>scope="root"</code>.
	Editing it here edits the header. Sub-links render as a nested list.
</p>

<CmsNav name="nav.primary" scope="root" fallback={demoPrimaryNav}>
	{#snippet children(items)}
		<ul>
			{#each items as item (item.id)}
				<li>
					<a href={item.href} aria-current={isActive(item, page.url) ? 'page' : undefined}
						>{item.label}</a
					>
					{#if item.newTab}<span class="muted"> (new tab)</span>{/if}
					{#if item.children.length}
						<ul>
							{#each item.children as child (child.id)}
								<li><a href={child.href}>{child.label}</a></li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{/snippet}
</CmsNav>

<h2>Footer navigation</h2>
<CmsNav name="nav.footer" scope="root" fallback={demoFooterNav}>
	{#snippet children(items)}
		<p>
			{#each items as item, i (item.id)}{#if i > 0}
					·
				{/if}<a href={item.href}>{item.label}</a>{/each}
		</p>
	{/snippet}
</CmsNav>
