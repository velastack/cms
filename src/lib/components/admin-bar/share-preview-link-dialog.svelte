<script lang="ts">
	import { Button } from './ui/button/index.js';
	import * as Dialog from './ui/dialog/index.js';
	import { Input } from './ui/input/index.js';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		previewUrl: string;
		onRegenerate: () => Promise<void> | void;
	};
	let { open, onOpenChange, previewUrl, onRegenerate }: Props = $props();

	let copied = $state(false);
	let regenerating = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (!open) {
			copied = false;
			if (copiedTimer) {
				clearTimeout(copiedTimer);
				copiedTimer = null;
			}
		}
	});

	const onCopy = async () => {
		if (!previewUrl) return;
		try {
			await navigator.clipboard.writeText(previewUrl);
			copied = true;
			if (copiedTimer) clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => (copied = false), 1600);
		} catch {
			/* clipboard may be unavailable; swallow silently */
		}
	};

	const onRegenerateClick = async () => {
		if (regenerating) return;
		regenerating = true;
		try {
			await onRegenerate();
		} finally {
			regenerating = false;
		}
	};
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="vela:max-w-[28rem]">
		<Dialog.Header>
			<Dialog.Title>Share preview link</Dialog.Title>
			<Dialog.Description>
				Anyone with this link can view your unpublished changes without signing in. Share it with
				teammates or stakeholders to gather feedback before publishing.
			</Dialog.Description>
		</Dialog.Header>

		<div class="vela:px-6 vela:pb-4 vela:flex vela:flex-col vela:gap-4">
			<div class="vela:flex vela:items-center vela:gap-2">
				<Input
					readonly
					value={previewUrl}
					onfocus={(e) => e.currentTarget.select()}
					class="vela:font-mono vela:text-[12px]"
				/>
				<Button variant="default" onclick={onCopy} disabled={!previewUrl}>
					{copied ? 'Copied' : 'Copy'}
				</Button>
			</div>

			<div
				class="vela:flex vela:items-start vela:justify-between vela:gap-3 vela:pt-3
					vela:border-t vela:border-[var(--cms-bar-divider)]"
			>
				<p class="vela:text-[12px] vela:text-bar-text-secondary vela:leading-snug vela:m-0">
					Regenerating the preview key revokes access for anyone holding a previously shared link.
				</p>
				<Button
					variant="outline-destructive"
					size="sm"
					onclick={onRegenerateClick}
					disabled={regenerating || !previewUrl}
					class="vela:shrink-0"
				>
					{regenerating ? 'Regenerating…' : 'Regenerate'}
				</Button>
			</div>
		</div>

		<Dialog.Footer class="vela:justify-end vela:pt-2">
			<Button variant="ghost" onclick={() => onOpenChange(false)}>Done</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
