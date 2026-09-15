<script lang="ts">
	import type { CmsDeployState } from '../../core/wire.js';
	import { describeLatestRun, isDeploying } from './deploy-state.js';
	import { Button } from './ui/button/index.js';
	import * as Dialog from './ui/dialog/index.js';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		deploy: CmsDeployState;
		/** Items in the working copy; they are not part of a deploy. */
		unpublishedCount: number;
		/** The POST is in flight. */
		deploying: boolean;
		error: string | null;
		onConfirm: () => void;
	};
	let { open, onOpenChange, deploy, unpublishedCount, deploying, error, onConfirm }: Props =
		$props();

	const inFlight = $derived(isDeploying(deploy));
	const status = $derived(describeLatestRun(deploy.latest));
</script>

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		if (!next && deploying) return;
		onOpenChange(next);
	}}
>
	<Dialog.Content class="vela:max-w-[28rem]">
		<Dialog.Header>
			<Dialog.Title>Deploy site</Dialog.Title>
			<Dialog.Description>
				Rebuilds the site with the latest published content and puts it live at
				<span class="vela:font-mono vela:text-bar-text">{deploy.site?.url ?? 'the live site'}</span
				>. Visitors only see published changes after a deploy.
			</Dialog.Description>
		</Dialog.Header>

		<div class="vela:px-6 vela:pb-4 vela:flex vela:flex-col vela:gap-3">
			<p class="vela:m-0 vela:text-[12px] vela:text-bar-text-secondary">{status}</p>

			{#if unpublishedCount > 0}
				<p
					class="vela:m-0 vela:px-3 vela:py-2 vela:rounded-md vela:text-[12px]
						vela:bg-[var(--cms-status-warn-bg)] vela:text-[var(--cms-status-warn-text)]"
				>
					{unpublishedCount}
					{unpublishedCount === 1 ? 'unpublished change' : 'unpublished changes'} in your working copy
					will not be included. Publish first to put them live.
				</p>
			{/if}

			{#if error}
				<p
					role="alert"
					class="vela:m-0 vela:px-3 vela:py-2 vela:rounded-md vela:text-[12px]
						vela:bg-[var(--cms-status-error-bg)] vela:text-[var(--cms-status-error-text)]"
				>
					{error}
				</p>
			{/if}
		</div>

		<Dialog.Footer class="vela:justify-end vela:pt-2">
			<Button variant="ghost" onclick={() => onOpenChange(false)} disabled={deploying}
				>Cancel</Button
			>
			<Button variant="default" onclick={onConfirm} disabled={deploying || inFlight}>
				{deploying ? 'Deploying…' : 'Deploy'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
