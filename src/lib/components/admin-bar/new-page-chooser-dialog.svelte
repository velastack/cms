<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { CmsCreatablePageConfigWithRouteId } from './page-config.js';
	import { resolveRouteOnlyParams } from './resolve-route.js';
	import { Button } from './ui/button/index.js';
	import * as Dialog from './ui/dialog/index.js';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		creatablePages: CmsCreatablePageConfigWithRouteId[];
		onSelect: (config: CmsCreatablePageConfigWithRouteId) => void;
	};
	let { open, onOpenChange, creatablePages, onSelect }: Props = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content showCloseButton={false} class="vela:max-w-[28rem]">
		<Dialog.Header>
			<Dialog.Title>New page</Dialog.Title>
			<Dialog.Description>Choose a template.</Dialog.Description>
		</Dialog.Header>

		<ul class="vela:list-none vela:m-0 vela:px-3 vela:pb-2 vela:flex vela:flex-col vela:gap-1">
			{#each creatablePages as cfg (cfg.routeId)}
				<li>
					<button
						type="button"
						onclick={() => onSelect(cfg)}
						class="vela:group vela:flex vela:items-center vela:gap-3 vela:w-full vela:px-3 vela:py-2.5 vela:rounded-md
							vela:text-left vela:cursor-pointer vela:focus:outline-none
							vela:hover:bg-[var(--cms-bar-bg-hover)] vela:focus-visible:bg-[var(--cms-bar-bg-hover)]"
					>
						<div class="vela:flex vela:flex-col vela:min-w-0 vela:flex-1">
							<span class="vela:text-[13px] vela:font-medium vela:text-bar-text vela:capitalize">
								{cfg.type}
							</span>
							<span class="vela:font-mono vela:text-[12px] vela:text-bar-text-secondary vela:truncate">
								{resolveRouteOnlyParams(cfg.routeId)}
							</span>
						</div>
						<ChevronRightIcon
							class="vela:size-4 vela:text-bar-text-tertiary vela:group-hover:text-bar-text"
						/>
					</button>
				</li>
			{/each}
		</ul>

		<Dialog.Footer class="vela:justify-end vela:pt-3">
			<Button variant="ghost" onclick={() => onOpenChange(false)}>Cancel</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
