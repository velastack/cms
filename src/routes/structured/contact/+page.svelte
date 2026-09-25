<script lang="ts">
	import { CmsContact, toPostalAddress } from '$lib/index.js';
	import { demoContact } from '../../_components/demo-content.js';
</script>

<h1>CmsContact</h1>
<p class="lede">
	Address, phones and emails from the root layout. The view adds <code>tel:</code>,
	<code>mailto:</code>, WhatsApp and directions hrefs and a formatted address.
</p>

<CmsContact name="contact" scope="root" fallback={demoContact}>
	{#snippet children(c)}
		{#if c.name}<h2>{c.name}</h2>{/if}
		{#if c.hasAddress}
			<h2>{c.labels.address}</h2>
			<address>
				{#each c.formattedAddress as line, i (i)}{line}<br />{/each}
			</address>
			{#if c.mapsHref}<p>
					<a href={c.mapsHref} target="_blank" rel="noopener">{c.labels.directions}</a>
				</p>{/if}
		{/if}
		{#if c.phones.length}
			<h2>{c.labels.phone}</h2>
			<dl class="rows">
				{#each c.phones as p (p.id)}
					<dt>{p.label}</dt>
					<dd><a href={p.href}>{p.number}</a></dd>
				{/each}
			</dl>
		{/if}
		{#if c.emails.length}
			<h2>{c.labels.email}</h2>
			<dl class="rows">
				{#each c.emails as e (e.id)}
					<dt>{e.label}</dt>
					<dd><a href={e.href}>{e.address}</a></dd>
				{/each}
			</dl>
		{/if}
		{#if c.whatsappHref}<p><a href={c.whatsappHref}>{c.labels.whatsapp}</a></p>{/if}
		<h2>PostalAddress</h2>
		<pre>{JSON.stringify(toPostalAddress(c), null, 2)}</pre>
	{/snippet}
</CmsContact>
