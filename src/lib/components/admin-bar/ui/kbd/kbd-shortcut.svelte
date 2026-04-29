<script lang="ts" module>
	// Multi-character tokens we don't want to split into individual chips.
	// Anything not in this list is rendered as a single character.
	const MULTI_CHAR_TOKENS = ['esc', 'tab', 'shift', 'ctrl', 'alt', 'opt', 'cmd'];

	export function splitShortcut(input: string): string[] {
		const tokens: string[] = [];
		let i = 0;
		const lower = input.toLowerCase();
		while (i < input.length) {
			const ch = input[i]!;
			if (ch === ' ' || ch === '+') {
				i += 1;
				continue;
			}
			let matched = false;
			for (const tok of MULTI_CHAR_TOKENS) {
				if (lower.startsWith(tok, i)) {
					tokens.push(input.slice(i, i + tok.length));
					i += tok.length;
					matched = true;
					break;
				}
			}
			if (!matched) {
				tokens.push(ch);
				i += 1;
			}
		}
		return tokens;
	}
</script>

<script lang="ts">
	import { cn } from '$lib/components/admin-bar/utils.js';
	import Kbd from './kbd.svelte';
	import KbdGroup from './kbd-group.svelte';

	type Props = {
		keys: string;
		class?: string;
	};
	let { keys, class: className }: Props = $props();

	const tokens = $derived(splitShortcut(keys));
</script>

<KbdGroup class={cn(className)}>
	{#each tokens as token}
		<Kbd>{token}</Kbd>
	{/each}
</KbdGroup>
