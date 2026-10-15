<!-- A numbered callout tying a region of the page to a note in <Explainer />. -->
<script lang="ts">
	let { n }: { n: number } = $props();
</script>

<span class="marker" title={`Note ${n} in "How this page works"`}>{n}</span>

<style>
	.marker {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 1.375rem;
		height: 1.375rem;
		border-radius: 999px;
		background: var(--note);
		color: white;
		font-family: var(--sans);
		font-size: 0.75rem;
		font-weight: 700;
		line-height: 1;
		vertical-align: middle;
	}
</style>
