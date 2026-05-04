<script lang="ts" module>
	type ShortcutEntry = { keys: string; label: string };
	type ShortcutGroup = { heading: string; entries: ShortcutEntry[] };

	// Mirrors DESIGN.md §9. Grouped to match the menubar's mental model so
	// users can scan to the right section by what they're trying to do.
	const SHORTCUT_GROUPS: ShortcutGroup[] = [
		{
			heading: 'Editing',
			entries: [
				{ keys: '⌘E', label: 'Enter edit mode' },
				{ keys: '⌘S', label: 'Save' },
				{ keys: 'esc', label: 'Cancel edit / close panel' },
				{ keys: '⌘Z', label: 'Revert last edit' }
			]
		},
		{
			heading: 'Page',
			entries: [
				{ keys: '⌘I', label: 'SEO & metadata for this page' },
				{ keys: '⌘↵', label: 'Open current page in new tab' },
				{ keys: '⌘P', label: 'Review & publish' }
			]
		},
		{
			heading: 'Navigate',
			entries: [
				{ keys: '⌘K', label: 'All pages' },
				{ keys: '⌘L', label: 'Locales' },
				{ keys: '⌘H', label: 'Recent releases' },
				{ keys: '/', label: 'Focus search (when a panel is open)' }
			]
		},
		{
			heading: 'Site',
			entries: [
				{ keys: '⌘N', label: 'New page' },
				{ keys: '⌘,', label: 'Site settings' }
			]
		},
		{
			heading: 'View',
			entries: [
				{ keys: '⌘.', label: 'Hide / show bar' },
				{ keys: '⌘⇧E', label: 'Toggle highlight editable areas' },
				{ keys: '⌘G', label: 'Toggle grid & spacing overlay' },
				{ keys: '?', label: 'Show this list' }
			]
		}
	];
</script>

<script lang="ts">
	import * as Dialog from './ui/dialog/index.js';
	import { KbdShortcut } from './ui/kbd/index.js';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
	};
	let { open, onOpenChange }: Props = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="vela:max-w-[34rem]">
		<Dialog.Header>
			<Dialog.Title>Keyboard shortcuts</Dialog.Title>
			<Dialog.Description>
				Single-letter shortcuts only fire when no input is focused.
			</Dialog.Description>
		</Dialog.Header>

		<div class="vela:px-6 vela:pb-5 vela:flex vela:flex-col vela:gap-5">
			{#each SHORTCUT_GROUPS as group}
				<section class="vela:flex vela:flex-col vela:gap-1.5">
					<h3
						class="vela:text-[10px] vela:font-semibold vela:uppercase vela:tracking-widest vela:text-bar-text-tertiary vela:m-0"
					>
						{group.heading}
					</h3>
					<ul class="vela:flex vela:flex-col vela:m-0 vela:p-0 vela:list-none">
						{#each group.entries as entry}
							<li
								class="vela:flex vela:items-center vela:justify-between vela:gap-3 vela:py-1.5 vela:text-[13px] vela:text-bar-text"
							>
								<span>{entry.label}</span>
								<KbdShortcut keys={entry.keys} />
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	</Dialog.Content>
</Dialog.Root>
