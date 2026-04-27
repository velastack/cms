<script lang="ts">
	type PublishedRelease = {
		id: string;
		name?: string;
		publishedBy: string;
		publishedAt: string;
		revertedAt?: string;
		items: Array<
			| { kind: 'page'; routeId: string; params: Record<string, string>; fields: Record<string, unknown> }
			| { kind: 'layout'; routeId: string; fields: Record<string, unknown> }
		>;
	};

	type Props = {
		endpoint: string;
		onClose: () => void;
		onChanged: () => Promise<void> | void;
	};
	let { endpoint, onClose, onChanged }: Props = $props();

	let history = $state<PublishedRelease[]>([]);
	let loading = $state(false);
	let reverting = $state<string | null>(null);

	const load = async () => {
		loading = true;
		try {
			const res = await fetch(`${endpoint}/release/history`);
			if (!res.ok) return;
			const data = (await res.json()) as { history: PublishedRelease[] };
			history = data.history;
		} finally {
			loading = false;
		}
	};

	$effect(() => {
		void load();
	});

	const onRevert = async (release: PublishedRelease) => {
		const label = release.name ?? release.id.slice(0, 8);
		if (!confirm(`Revert release "${label}"? This will create a new release that undoes its changes.`))
			return;
		reverting = release.id;
		try {
			const res = await fetch(`${endpoint}/release/history/${release.id}/revert`, {
				method: 'POST'
			});
			if (!res.ok) return;
			await load();
			await onChanged();
		} finally {
			reverting = null;
		}
	};

	const formatDate = (iso: string): string => {
		try {
			return new Date(iso).toLocaleString();
		} catch {
			return iso;
		}
	};

	const itemSummary = (release: PublishedRelease): string => {
		let pages = 0;
		let layouts = 0;
		for (const i of release.items) {
			if (i.kind === 'page') pages += 1;
			else layouts += 1;
		}
		const parts: string[] = [];
		if (pages > 0) parts.push(`${pages} page${pages === 1 ? '' : 's'}`);
		if (layouts > 0) parts.push(`${layouts} layout${layouts === 1 ? '' : 's'}`);
		return parts.join(' · ') || '0 items';
	};
</script>

<div class="cms-panel" role="dialog" aria-label="Release history">
	<header class="cms-panel__header">
		<h2>History</h2>
		<button type="button" class="cms-panel__close" aria-label="Close" onclick={onClose}>×</button>
	</header>

	{#if loading && history.length === 0}
		<p class="cms-panel__empty">Loading…</p>
	{:else if history.length === 0}
		<p class="cms-panel__empty">No published releases yet.</p>
	{:else}
		<ul class="cms-panel__items">
			{#each history as release (release.id)}
				<li class="cms-panel__item">
					<div class="cms-panel__item-main">
						<div class="cms-panel__item-label">
							{release.name ?? release.id.slice(0, 8)}
							{#if release.revertedAt}<span class="cms-history__reverted">reverted</span>{/if}
						</div>
						<div class="cms-panel__item-fields">
							{itemSummary(release)} · {formatDate(release.publishedAt)}
						</div>
					</div>
					<button
						type="button"
						class="cms-panel__discard"
						disabled={reverting === release.id || !!release.revertedAt}
						onclick={() => onRevert(release)}
					>
						{reverting === release.id ? '…' : 'Revert'}
					</button>
				</li>
			{/each}
		</ul>
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
		font-size: 0.85rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.cms-panel__item-fields {
		font-size: 0.7rem;
		opacity: 0.6;
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
	.cms-panel__discard:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.12);
	}
	.cms-panel__discard:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.cms-history__reverted {
		display: inline-block;
		padding: 0.05rem 0.4rem;
		border-radius: 9999px;
		background: rgba(240, 180, 60, 0.2);
		color: #f5d27a;
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
</style>
