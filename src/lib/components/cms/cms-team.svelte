<script lang="ts" module>
	/** `CmsTeam`: people with a portrait, role and bio. */
	export * from '../../core/shapes/team.js';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Structured from './cms-structured.svelte';
	import { cmsTeam, teamView, type CmsTeamValue, type TeamMember } from '../../core/shapes/team.js';

	type Props = {
		name: string;
		scope?: string;
		/** The full value, or a bare item list. */
		fallback?: Partial<CmsTeamValue> | Array<Partial<CmsTeamValue['items'][number]>>;
		value?: unknown;
		children: Snippet<[TeamMember[]]>;
	};
	let { name, scope, fallback, value, children }: Props = $props();
</script>

<Structured schema={cmsTeam} {name} {scope} {fallback} {value} view={teamView} {children} />
