<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tick as svelteTick } from 'svelte';
	import { page } from '$app/state';
	import { cmsStore, type CmsScopeRef } from './cms-store.svelte.js';
	import { resolveRouteUrl } from '../admin-bar/resolve-route.js';
	import type { CmsLinkValue, CmsLinkRenderProps } from './cms-link.svelte';
	import { Button } from '../admin-bar/ui/button/index.js';
	import { Input } from '../admin-bar/ui/input/index.js';
	import * as Select from '../admin-bar/ui/select/index.js';
	import CssRoot from '../admin-bar/css-root.svelte';
	import LinkIcon from '../admin-bar/icons/link.svelte';
	import FileIcon from '../admin-bar/icons/file.svelte';
	import ExternalIcon from '../admin-bar/icons/external-link.svelte';
	import CheckIcon from '../admin-bar/icons/check.svelte';
	import XIcon from '../admin-bar/icons/x.svelte';
	import Trash from '../admin-bar/icons/trash-2.svelte';

	type PageEntry = {
		params: Record<string, string>;
		isDraft: boolean;
		isDeletePending: boolean;
		redirectTo?: string;
		gone?: boolean;
	};
	type PageRoute = {
		routeId: string;
		ownedParams: string[];
		entries: PageEntry[];
	};

	type Props = {
		scope: CmsScopeRef;
		name: string;
		initial: CmsLinkValue;
		className?: string;
		children?: Snippet<[CmsLinkRenderProps]>;
	};
	let { scope, name, initial, className, children }: Props = $props();

	const endpoint = $derived(page.data.cms?.endpoint ?? '/api/cms');

	const current = $derived.by((): CmsLinkValue => {
		const draft = cmsStore.getValue(scope, name);
		if (draft && typeof draft === 'object') return draft as CmsLinkValue;
		return initial;
	});

	const set = (next: CmsLinkValue) => cmsStore.setValue(scope, name, next);

	const href = $derived.by(() => {
		if (current.routeId) {
			try {
				return resolveRouteUrl(current.routeId, current.params ?? {});
			} catch {
				return '#';
			}
		}
		return current.href ?? '#';
	});
	const isInternal = $derived(!!current.routeId);

	let mode: 'idle' | 'url' | 'page' = $state('idle');

	let urlInput = $state('');
	let urlInputEl: HTMLInputElement | null = $state(null);

	let pages: PageRoute[] = $state([]);
	let pagesLoaded = $state(false);
	let selectedValue = $state('');
	let pageSelectOpen = $state(false);

	let labelEl: HTMLElement | undefined = $state();
	let composing = false;

	$effect(() => {
		if (!labelEl) return;
		const target = current.label ?? '';
		if (document.activeElement === labelEl) return;
		if (labelEl.textContent === target) return;
		labelEl.textContent = target;
	});

	const onLabelInput = (e: Event) => {
		if (composing) return;
		set({ ...current, label: (e.currentTarget as HTMLElement).textContent ?? '' });
	};
	const onLabelKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Enter') e.preventDefault();
	};
	const onLabelCompositionEnd = (e: CompositionEvent) => {
		composing = false;
		set({ ...current, label: (e.currentTarget as HTMLElement).textContent ?? '' });
	};

	const enterUrlMode = async (e: Event) => {
		e.preventDefault();
		e.stopPropagation();
		urlInput = current.href ?? '';
		mode = 'url';
		await svelteTick();
		urlInputEl?.focus();
		urlInputEl?.select();
	};

	const applyUrl = (e?: Event) => {
		e?.preventDefault();
		e?.stopPropagation();
		const v = urlInput.trim();
		set({
			label: current.label,
			href: v || undefined,
			routeId: undefined,
			params: undefined,
			newTab: current.newTab
		});
		mode = 'idle';
	};

	const cancelMode = (e?: Event) => {
		e?.preventDefault();
		e?.stopPropagation();
		mode = 'idle';
	};

	const onUrlKey = (e: KeyboardEvent) => {
		if (e.key === 'Enter') applyUrl(e);
		else if (e.key === 'Escape') cancelMode(e);
	};

	const optionValueFor = (routeId: string, params: Record<string, string>) =>
		`${routeId}::${JSON.stringify(params)}`;

	const enterPageMode = async (e: Event) => {
		e.preventDefault();
		e.stopPropagation();
		selectedValue = current.routeId ? optionValueFor(current.routeId, current.params ?? {}) : '';
		mode = 'page';
		if (!pagesLoaded) {
			try {
				const res = await fetch(`${endpoint}/pages`, { credentials: 'include' });
				if (res.ok) {
					const data = (await res.json()) as { routes: PageRoute[] };
					pages = data.routes;
				}
			} catch {
				/* ignore — picker shows "No pages found" */
			}
			pagesLoaded = true;
		}
	};

	const pageOptions = $derived.by(() => {
		const opts: {
			value: string;
			label: string;
			routeId: string;
			params: Record<string, string>;
		}[] = [];
		for (const r of pages) {
			const entries =
				r.entries.length > 0
					? r.entries
					: [{ params: {} as Record<string, string>, isDraft: false, isDeletePending: false }];
			for (const ent of entries) {
				// Tombstones (redirected / gone) aren't real link targets.
				if (ent.redirectTo || ent.gone) continue;
				let url: string;
				try {
					url = resolveRouteUrl(r.routeId, ent.params);
				} catch {
					continue;
				}
				opts.push({
					value: optionValueFor(r.routeId, ent.params),
					label: url,
					routeId: r.routeId,
					params: ent.params
				});
			}
		}
		opts.sort((a, b) => a.label.localeCompare(b.label));
		return opts;
	});

	const applyPageValue = (value: string) => {
		const opt = pageOptions.find((o) => o.value === value);
		if (!opt) return;
		set({
			label: current.label,
			routeId: opt.routeId,
			params: opt.params,
			href: undefined,
			newTab: current.newTab
		});
		mode = 'idle';
	};

	const toggleNewTab = (e: Event) => {
		e.preventDefault();
		e.stopPropagation();
		set({ ...current, newTab: !current.newTab });
	};

	const clearTarget = (e: Event) => {
		e.preventDefault();
		e.stopPropagation();
		set({ label: current.label, newTab: current.newTab });
	};

	const stopMouseDown = (e: MouseEvent) => e.preventDefault();
	const blockNav = (e: Event) => e.preventDefault();

	const renderProps = $derived<CmsLinkRenderProps>({
		label: current.label ?? '',
		href,
		newTab: !!current.newTab
	});
</script>

<CssRoot>
	<span
		class="cms-link-edit"
		role="group"
		aria-label={`Link slot ${name}`}
		data-popover-open={pageSelectOpen ? '' : undefined}
	>
		{#if children}
			<span class="cms-link-edit__custom">
				{@render children(renderProps)}
			</span>
		{:else}
			<a
				class={className ?? 'cms-link'}
				{href}
				aria-label={current.label || name}
				target={current.newTab ? '_blank' : undefined}
				rel={current.newTab ? 'noopener noreferrer' : undefined}
				onclick={blockNav}
			>
				<span
					bind:this={labelEl}
					class="cms-link-edit__label"
					contenteditable="plaintext-only"
					role="textbox"
					tabindex="0"
					aria-label={`${name} label`}
					spellcheck="true"
					data-placeholder={name}
					oninput={onLabelInput}
					onkeydown={onLabelKeydown}
					oncompositionstart={() => (composing = true)}
					oncompositionend={onLabelCompositionEnd}
				></span>
			</a>
		{/if}

		<div
			class="cms-link-edit__toolbar"
			role="toolbar"
			tabindex="-1"
			aria-label="Link target"
			onmousedown={stopMouseDown}
		>
			{#if mode === 'idle'}
				<span class="cms-link-edit__href" title={href}>
					<span class="cms-link-edit__href-arrow">{isInternal ? '↪' : '↗'}</span>
					<span class="cms-link-edit__href-text">{href === '#' ? '(no target)' : href}</span>
				</span>
				<span class="cms-link-edit__divider"></span>
				<Button size="xs" variant="ghost" data-active={isInternal} onclick={enterPageMode}>
					<FileIcon class="vela:size-3.5" />
					Page
				</Button>
				<Button
					size="xs"
					variant="ghost"
					data-active={!isInternal && !!current.href}
					onclick={enterUrlMode}
				>
					<LinkIcon class="vela:size-3.5" />
					URL
				</Button>
				<Button
					size="icon"
					variant="ghost"
					data-active={!!current.newTab}
					aria-label={current.newTab ? 'Open in new tab (on)' : 'Open in new tab (off)'}
					onclick={toggleNewTab}
				>
					<ExternalIcon class="vela:size-3.5" />
				</Button>
				{#if current.href || current.routeId}
					<Button size="icon" variant="ghost" aria-label="Clear link target" onclick={clearTarget}>
						<Trash class="vela:size-3.5" />
					</Button>
				{/if}
			{:else if mode === 'url'}
				<Input
					bind:ref={urlInputEl}
					bind:value={urlInput}
					type="url"
					placeholder="https://example.com"
					onkeydown={onUrlKey}
					class="vela:h-7 vela:w-72 vela:text-xs"
				/>
				<Button size="icon" variant="ghost" aria-label="Apply URL" onclick={applyUrl}>
					<CheckIcon class="vela:size-4" />
				</Button>
				<Button size="icon" variant="ghost" aria-label="Cancel" onclick={cancelMode}>
					<XIcon class="vela:size-4" />
				</Button>
			{:else}
				{#if !pagesLoaded}
					<span class="cms-link-edit__status">Loading…</span>
				{:else if pageOptions.length === 0}
					<span class="cms-link-edit__status">No pages found</span>
				{:else}
					{@const selectedOpt = pageOptions.find((o) => o.value === selectedValue)}
					<Select.Root
						type="single"
						value={selectedValue}
						onValueChange={(v) => {
							selectedValue = v;
							applyPageValue(v);
						}}
						bind:open={pageSelectOpen}
					>
						<Select.Trigger size="sm" class="vela:min-w-56">
							<span data-slot="select-value" class="vela:truncate">
								{selectedOpt?.label ?? '— Select page —'}
							</span>
						</Select.Trigger>
						<Select.Content sideOffset={6}>
							{#each pageOptions as opt (opt.value)}
								<Select.Item value={opt.value} label={opt.label}>{opt.label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				{/if}
				<Button size="icon" variant="ghost" aria-label="Cancel" onclick={cancelMode}>
					<XIcon class="vela:size-4" />
				</Button>
			{/if}
		</div>
	</span>
</CssRoot>

<style>
	.cms-link-edit {
		position: relative;
		display: inline-block;
		vertical-align: baseline;
		border-radius: 0.125rem;
		outline: 1px dashed rgba(127, 127, 127, 0.6);
		outline-offset: 2px;
	}
	.cms-link-edit:hover,
	.cms-link-edit:focus-within {
		outline: 2px solid var(--cms-accent, #534ab7);
		outline-offset: 2px;
	}
	.cms-link-edit__custom {
		display: inline;
	}
	.cms-link-edit__label {
		outline: none;
		min-width: 1ch;
	}
	.cms-link-edit__label:empty::before {
		content: attr(data-placeholder);
		color: rgba(127, 127, 127, 0.6);
		font-style: italic;
	}
	.cms-link-edit__toolbar {
		position: absolute;
		top: 0;
		left: 0;
		transform: translateY(calc(-100% - 0.5rem));
		display: none;
		align-items: center;
		gap: 0.125rem;
		padding: 0.25rem;
		background: var(--cms-bar-bg, #1f1f1f);
		border: 1px solid var(--cms-bar-divider, #3a3a3a);
		border-radius: 0.375rem;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
		color: var(--cms-bar-text, #f5f5f5);
		z-index: 50;
		white-space: nowrap;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}
	.cms-link-edit:hover .cms-link-edit__toolbar,
	.cms-link-edit:focus-within .cms-link-edit__toolbar,
	.cms-link-edit[data-popover-open] .cms-link-edit__toolbar {
		display: inline-flex;
	}
	.cms-link-edit__toolbar :global([data-active='true']) {
		background: var(--cms-bar-bg-hover, #2e2e2e);
		color: var(--cms-bar-text, #f5f5f5);
	}
	.cms-link-edit__divider {
		display: inline-block;
		width: 1px;
		align-self: stretch;
		margin: 0.125rem 0.25rem;
		background: var(--cms-bar-divider, #3a3a3a);
	}
	.cms-link-edit__href {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0 0.5rem;
		max-width: 18rem;
		font-size: 0.6875rem;
		font-family: ui-monospace, monospace;
		color: var(--cms-bar-text-secondary, #a3a3a3);
	}
	.cms-link-edit__href-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cms-link-edit__status {
		padding: 0 0.5rem;
		font-size: 0.75rem;
		color: var(--cms-bar-text-secondary, #a3a3a3);
	}
</style>
