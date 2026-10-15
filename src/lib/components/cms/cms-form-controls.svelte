<script lang="ts">
	/**
	 * The fields a form sends for the endpoint rather than the submission:
	 * where to go after a post without JavaScript, the load-time token, and
	 * a honeypot that only bots fill in. The hosted endpoint reads and drops
	 * all three; a same-app action can do the same or ignore them.
	 */
	type Props = { redirect?: string; token: string | null };
	let { redirect, token }: Props = $props();
</script>

{#if redirect}
	<input type="hidden" name="_redirect" value={redirect} />
{/if}
{#if token}
	<input type="hidden" name="_token" value={token} />
{/if}
<div
	aria-hidden="true"
	style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden"
>
	<input type="text" name="_gotcha" tabindex="-1" autocomplete="off" />
</div>
