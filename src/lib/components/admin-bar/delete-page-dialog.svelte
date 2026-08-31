<script lang="ts">
	import { Button } from './ui/button/index.js';
	import * as Dialog from './ui/dialog/index.js';
	import { Input } from './ui/input/index.js';
	import { Label } from './ui/label/index.js';
	import * as Select from './ui/select/index.js';

	export type DeletePageMode = 'delete' | 'gone' | 'redirect';

	export type RedirectTarget = {
		url: string;
		routeId: string;
		params: Record<string, string>;
	};

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		/** The URL being deleted, shown in the heading and used for self-redirect detection. */
		url: string;
		/**
		 * `true` when the page exists only as a draft in the open release. Disables
		 * gone/redirect options — the page was never live so there's no equity to
		 * preserve and "discard draft" is the only meaningful action.
		 */
		isDraft: boolean;
		/** Selectable redirect targets — pages-panel passes the filtered page list. */
		targets: RedirectTarget[];
		/**
		 * Map of source-url → terminal-redirect-url for chains in the working
		 * release plus any published tombstones. Used to auto-flatten if the user
		 * picks a target that's itself redirected.
		 */
		redirectsByUrl: Record<string, string>;
		deleting: boolean;
		error: string | null;
		onConfirm: (mode: DeletePageMode, target?: string) => void;
	};

	let {
		open,
		onOpenChange,
		url,
		isDraft,
		targets,
		redirectsByUrl,
		deleting,
		error,
		onConfirm
	}: Props = $props();

	let mode = $state<DeletePageMode>('delete');
	let pageTargetValue = $state('');
	let externalUrl = $state('');
	let useExternal = $state(false);

	$effect.pre(() => {
		if (!open) return;
		mode = 'delete';
		pageTargetValue = '';
		externalUrl = '';
		useExternal = false;
	});

	const optionValueFor = (t: RedirectTarget) => `${t.routeId}::${JSON.stringify(t.params)}`;

	const selectableTargets = $derived(targets.filter((t) => t.url !== url));

	const pickedRawTarget = $derived.by((): string => {
		if (mode !== 'redirect') return '';
		if (useExternal) return externalUrl.trim();
		const opt = selectableTargets.find((t) => optionValueFor(t) === pageTargetValue);
		return opt?.url ?? '';
	});

	/**
	 * Walk the redirect chain from `target` until we hit a URL that isn't itself
	 * a redirect, or we revisit a URL (cycle). Returns the terminal URL plus the
	 * number of hops taken — when hops > 0 the dialog surfaces a notice that the
	 * stored target will be the flattened terminal.
	 */
	const resolved = $derived.by((): { terminal: string; hops: number; cycle: boolean } => {
		const t = pickedRawTarget;
		if (!t) return { terminal: '', hops: 0, cycle: false };
		const seen = new Set<string>([url]);
		let cur = t;
		let hops = 0;
		while (redirectsByUrl[cur]) {
			if (seen.has(cur)) return { terminal: cur, hops, cycle: true };
			seen.add(cur);
			cur = redirectsByUrl[cur];
			hops += 1;
			if (hops > 50) return { terminal: cur, hops, cycle: true };
		}
		return {
			terminal: cur,
			hops,
			cycle: cur === url
		};
	});

	const isSelfRedirect = $derived(
		mode === 'redirect' && pickedRawTarget !== '' && resolved.terminal === url
	);

	const canSubmit = $derived.by(() => {
		if (deleting) return false;
		if (mode === 'redirect') {
			if (resolved.terminal === '') return false;
			if (isSelfRedirect) return false;
		}
		return true;
	});

	const submit = () => {
		if (!canSubmit) return;
		if (mode === 'redirect') onConfirm('redirect', resolved.terminal);
		else onConfirm(mode);
	};
</script>

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		if (!next && deleting) return;
		onOpenChange(next);
	}}
>
	<Dialog.Content showCloseButton={false} class="vela:max-w-[28rem]">
		<form
			class="vela:flex vela:flex-col vela:gap-0"
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<Dialog.Header>
				<Dialog.Title>{isDraft ? 'Discard draft page' : 'Delete page'}</Dialog.Title>
				<Dialog.Description>
					<span class="vela:font-mono">{url}</span>
				</Dialog.Description>
			</Dialog.Header>

			<div class="vela:px-6 vela:pb-2 vela:flex vela:flex-col vela:gap-3">
				{#if isDraft}
					<p class="vela:text-[13px] vela:text-bar-text-secondary">
						This page is unpublished. Discarding removes the draft entirely.
					</p>
				{:else}
					<fieldset class="vela:flex vela:flex-col vela:gap-2 vela:m-0 vela:p-0 vela:border-0">
						<legend class="vela:sr-only">Choose deletion mode</legend>

						<label
							class="vela:flex vela:items-start vela:gap-2 vela:cursor-pointer vela:p-2 vela:rounded-md vela:hover:bg-[var(--cms-bar-bg-hover)]"
						>
							<input
								type="radio"
								name="delete-mode"
								value="delete"
								checked={mode === 'delete'}
								onchange={() => (mode = 'delete')}
								disabled={deleting}
								class="vela:mt-0.5"
							/>
							<span class="vela:flex vela:flex-col vela:gap-0.5">
								<span class="vela:text-[13px] vela:text-bar-text">
									Delete page (404 Not Found)
								</span>
								<span class="vela:text-[12px] vela:text-bar-text-secondary">
									The URL becomes a regular not-found.
								</span>
							</span>
						</label>

						<label
							class="vela:flex vela:items-start vela:gap-2 vela:cursor-pointer vela:p-2 vela:rounded-md vela:hover:bg-[var(--cms-bar-bg-hover)]"
						>
							<input
								type="radio"
								name="delete-mode"
								value="gone"
								checked={mode === 'gone'}
								onchange={() => (mode = 'gone')}
								disabled={deleting}
								class="vela:mt-0.5"
							/>
							<span class="vela:flex vela:flex-col vela:gap-0.5">
								<span class="vela:text-[13px] vela:text-bar-text">
									Mark as permanently gone (410)
								</span>
								<span class="vela:text-[12px] vela:text-bar-text-secondary">
									Tells crawlers the URL is intentionally removed.
								</span>
							</span>
						</label>

						<label
							class="vela:flex vela:items-start vela:gap-2 vela:cursor-pointer vela:p-2 vela:rounded-md vela:hover:bg-[var(--cms-bar-bg-hover)]"
						>
							<input
								type="radio"
								name="delete-mode"
								value="redirect"
								checked={mode === 'redirect'}
								onchange={() => (mode = 'redirect')}
								disabled={deleting}
								class="vela:mt-0.5"
							/>
							<span class="vela:flex vela:flex-col vela:gap-0.5">
								<span class="vela:text-[13px] vela:text-bar-text">
									Replace with redirect (308)
								</span>
								<span class="vela:text-[12px] vela:text-bar-text-secondary">
									Send visitors to another URL. Preserves SEO equity.
								</span>
							</span>
						</label>
					</fieldset>

					{#if mode === 'redirect'}
						<div
							class="vela:flex vela:flex-col vela:gap-2 vela:pl-7 vela:border-l vela:border-[var(--cms-bar-divider)] vela:ml-2"
						>
							<div class="vela:flex vela:items-center vela:gap-3">
								<Label class="vela:text-[12px] vela:text-bar-text-secondary">Target:</Label>
								<label class="vela:text-[12px] vela:flex vela:items-center vela:gap-1">
									<input
										type="radio"
										name="target-source"
										checked={!useExternal}
										onchange={() => (useExternal = false)}
										disabled={deleting}
									/>
									Page
								</label>
								<label class="vela:text-[12px] vela:flex vela:items-center vela:gap-1">
									<input
										type="radio"
										name="target-source"
										checked={useExternal}
										onchange={() => (useExternal = true)}
										disabled={deleting}
									/>
									External URL
								</label>
							</div>

							{#if useExternal}
								<Input
									type="url"
									placeholder="https://other-site.com/page"
									bind:value={externalUrl}
									disabled={deleting}
								/>
							{:else if selectableTargets.length === 0}
								<p class="vela:text-[12px] vela:text-bar-text-tertiary">
									No other pages available — switch to External URL.
								</p>
							{:else}
								<Select.Root
									type="single"
									value={pageTargetValue}
									onValueChange={(v) => (pageTargetValue = v)}
								>
									<Select.Trigger size="sm">
										<span data-slot="select-value" class="vela:truncate">
											{selectableTargets.find((t) => optionValueFor(t) === pageTargetValue)?.url ??
												'— Select page —'}
										</span>
									</Select.Trigger>
									<Select.Content sideOffset={6}>
										{#each selectableTargets as t (optionValueFor(t))}
											<Select.Item value={optionValueFor(t)} label={t.url}>
												{t.url}
											</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							{/if}

							{#if isSelfRedirect}
								<p class="vela:text-[12px] vela:text-[var(--cms-status-error-text)]" role="alert">
									This would redirect to itself.
								</p>
							{:else if resolved.hops > 0 && resolved.terminal !== ''}
								<p class="vela:text-[12px] vela:text-bar-text-secondary">
									Will redirect directly to <span class="vela:font-mono">{resolved.terminal}</span>
									(skipping {resolved.hops} chained redirect{resolved.hops === 1 ? '' : 's'}).
								</p>
							{/if}
						</div>
					{/if}
				{/if}
			</div>

			{#if error}
				<p
					role="alert"
					class="vela:mx-6 vela:mt-2 vela:px-3 vela:py-2 vela:rounded-md
						vela:bg-[var(--cms-status-error-bg)] vela:text-[var(--cms-status-error-text)] vela:text-[12px]"
				>
					{error}
				</p>
			{/if}

			<Dialog.Footer class="vela:justify-end vela:pt-4">
				<Button variant="ghost" onclick={() => onOpenChange(false)} disabled={deleting}>
					Cancel
				</Button>
				<Button type="submit" variant="outline-destructive" disabled={!canSubmit}>
					{#if deleting}
						Working…
					{:else if isDraft}
						Discard
					{:else if mode === 'redirect'}
						Stage redirect
					{:else if mode === 'gone'}
						Stage 410
					{:else}
						Stage delete
					{/if}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
