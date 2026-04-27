<script lang="ts">
	import { cmsStore, type ReleaseItem } from '../cms/cms-store.svelte.js';
	import { resolveRouteUrl } from './resolve-route.js';

	type Props = {
		endpoint: string;
		previewUrl: string;
		onClose: () => void;
		onChanged: () => Promise<void> | void;
	};
	let { endpoint, previewUrl, onClose, onChanged }: Props = $props();

	let copyState = $state<'idle' | 'copied'>('idle');
	let regenerating = $state(false);
	let discarding = $state<string | null>(null);

	const items = $derived(cmsStore.openRelease?.items ?? []);

	const itemKey = (item: ReleaseItem): string => {
		if (item.kind === 'layout') return `layout:${item.routeId}`;
		const prefix = item.kind === 'page-delete' ? 'page-delete' : 'page';
		return `${prefix}:${item.routeId}?${JSON.stringify(item.params)}`;
	};

	const itemLabel = (item: ReleaseItem): string => {
		if (item.kind === 'layout') return `Layout · ${item.routeId}`;
		const url = resolveRouteUrl(item.routeId, item.params);
		if (item.kind === 'page-delete') return `Delete · ${url}`;
		return `Page · ${url}`;
	};

	const itemFieldList = (item: ReleaseItem): string[] => {
		if (item.kind === 'page-delete') return [];
		const out: string[] = [];
		for (const k of Object.keys(item.fields)) {
			if (k === '_metadata') {
				const meta = item.fields._metadata as Record<string, unknown> | undefined;
				if (meta) {
					for (const mk of Object.keys(meta)) out.push(`_metadata.${mk}`);
				}
			} else {
				out.push(k);
			}
		}
		return out;
	};

	const itemSummary = (item: ReleaseItem): string => {
		if (item.kind === 'page-delete') return '(removes page)';
		return itemFieldList(item).join(', ');
	};

	const onCopy = async () => {
		try {
			await navigator.clipboard.writeText(previewUrl);
			copyState = 'copied';
			setTimeout(() => (copyState = 'idle'), 1500);
		} catch {
			copyState = 'idle';
		}
	};

	const onRegenerate = async () => {
		regenerating = true;
		try {
			const res = await fetch(`${endpoint}/release/preview-key`, { method: 'POST' });
			if (!res.ok) return;
			await cmsStore.fetchOpenRelease(endpoint);
			await onChanged();
		} finally {
			regenerating = false;
		}
	};

	const onDiscardItem = async (item: ReleaseItem) => {
		const key = itemKey(item);
		discarding = key;
		try {
			const body =
				item.kind === 'layout'
					? { kind: 'layout', routeId: item.routeId }
					: { kind: item.kind, routeId: item.routeId, params: item.params };
			const res = await fetch(`${endpoint}/release/items`, {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) return;
			await cmsStore.fetchOpenRelease(endpoint);
			await onChanged();
		} finally {
			discarding = null;
		}
	};

	const onDiscardAll = async () => {
		if (!confirm('Discard all pending edits in your working copy?')) return;
		const res = await fetch(`${endpoint}/release/discard`, { method: 'POST' });
		if (!res.ok) return;
		cmsStore.setOpenRelease(null);
		await onChanged();
		onClose();
	};
</script>

<div class="cms-panel" role="dialog" aria-label="Working copy">
	<header class="cms-panel__header">
		<h2>Working copy</h2>
		<button type="button" class="cms-panel__close" aria-label="Close" onclick={onClose}>×</button>
	</header>

	{#if items.length === 0}
		<p class="cms-panel__empty">No pending edits.</p>
	{:else}
		<ul class="cms-panel__items">
			{#each items as item (itemKey(item))}
				<li class="cms-panel__item">
					<div class="cms-panel__item-main">
						<div class="cms-panel__item-label">{itemLabel(item)}</div>
						<div class="cms-panel__item-fields">{itemSummary(item)}</div>
					</div>
					<button
						type="button"
						class="cms-panel__discard"
						aria-label="Discard this item"
						disabled={discarding === itemKey(item)}
						onclick={() => onDiscardItem(item)}
					>
						{discarding === itemKey(item) ? '…' : 'Discard'}
					</button>
				</li>
			{/each}
		</ul>

		<footer class="cms-panel__preview">
			<label class="cms-panel__preview-label">
				<span>Preview link</span>
				<div class="cms-panel__preview-row">
					<input
						type="text"
						readonly
						value={previewUrl}
						onfocus={(e) => e.currentTarget.select()}
					/>
					<button type="button" class="cms-btn" onclick={onCopy}>
						{copyState === 'copied' ? 'Copied' : 'Copy'}
					</button>
				</div>
				<small>Anyone with this link can preview the working copy without signing in.</small>
			</label>
			<div class="cms-panel__preview-actions">
				<button
					type="button"
					class="cms-btn cms-btn--ghost"
					onclick={onRegenerate}
					disabled={regenerating}
				>
					{regenerating ? 'Regenerating…' : 'Regenerate key'}
				</button>
				<button type="button" class="cms-btn cms-btn--danger" onclick={onDiscardAll}>
					Discard all
				</button>
			</div>
		</footer>
	{/if}
</div>

<style>
	.cms-panel {
		position: fixed;
		top: 4rem;
		left: 50%;
		transform: translateX(-50%);
		width: min(100%, 36rem);
		padding: 1rem;
		border-radius: 0.75rem;
		background: rgba(20, 20, 20, 0.94);
		color: #fafafa;
		backdrop-filter: blur(8px);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
		z-index: 9998;
		font-family:
			ui-sans-serif,
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			sans-serif;
		font-size: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-height: calc(100vh - 6rem);
	}
	.cms-panel__header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.cms-panel__header h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}
	.cms-panel__close {
		width: 1.75rem;
		height: 1.75rem;
		border: 0;
		border-radius: 9999px;
		background: rgba(255, 255, 255, 0.06);
		color: inherit;
		cursor: pointer;
		font-size: 1.1rem;
		line-height: 1;
	}
	.cms-panel__close:hover {
		background: rgba(255, 255, 255, 0.14);
	}
	.cms-panel__empty {
		margin: 0;
		opacity: 0.7;
	}
	.cms-panel__items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		overflow-y: auto;
		max-height: 18rem;
	}
	.cms-panel__item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.625rem;
		border-radius: 0.375rem;
		background: rgba(255, 255, 255, 0.04);
	}
	.cms-panel__item-main {
		flex: 1;
		min-width: 0;
	}
	.cms-panel__item-label {
		font-family: ui-monospace, monospace;
		font-size: 0.78rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cms-panel__item-fields {
		font-size: 0.7rem;
		opacity: 0.6;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cms-panel__discard {
		flex-shrink: 0;
		padding: 0.25rem 0.55rem;
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 9999px;
		background: transparent;
		color: inherit;
		cursor: pointer;
		font: inherit;
		font-size: 0.72rem;
	}
	.cms-panel__discard:hover {
		background: rgba(255, 255, 255, 0.12);
	}
	.cms-panel__discard:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.cms-panel__preview {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}
	.cms-panel__preview-label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.78rem;
	}
	.cms-panel__preview-label span {
		opacity: 0.7;
	}
	.cms-panel__preview-row {
		display: flex;
		gap: 0.4rem;
	}
	.cms-panel__preview-row input {
		flex: 1;
		min-width: 0;
		padding: 0.35rem 0.55rem;
		border-radius: 0.375rem;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(255, 255, 255, 0.04);
		color: inherit;
		font: inherit;
		font-family: ui-monospace, monospace;
		font-size: 0.72rem;
	}
	.cms-panel__preview-label small {
		opacity: 0.55;
		font-size: 0.7rem;
	}
	.cms-panel__preview-actions {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	:global(.cms-btn--danger) {
		background: rgba(220, 60, 60, 0.18);
		border-color: rgba(220, 60, 60, 0.4);
		color: #ffb3b3;
	}
	:global(.cms-btn--danger:hover) {
		background: rgba(220, 60, 60, 0.3);
	}
</style>
