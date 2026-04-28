<script lang="ts">
	import PanelFooter from './panel-footer.svelte';
	import PanelHeader from './panel-header.svelte';
	import Panel from './panel.svelte';
	import { resolveRouteOnlyParams, resolveRouteUrl } from './resolve-route.js';
	import { Badge } from './ui/badge/index.js';
	import { Button } from './ui/button/index.js';

	type ReleaseItem =
		| { kind: 'page'; routeId: string; params: Record<string, string>; fields: Record<string, unknown> }
		| { kind: 'page-delete'; routeId: string; params: Record<string, string> }
		| { kind: 'layout'; routeId: string; fields: Record<string, unknown> };

	type PublishedRelease = {
		id: string;
		name?: string;
		publishedBy: string;
		publishedAt: string;
		revertedAt?: string;
		items: ReleaseItem[];
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
		if (
			!confirm(`Revert release "${label}"? This will create a new release that undoes its changes.`)
		)
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
			const d = new Date(iso);
			const now = new Date();
			const sameDay =
				d.getFullYear() === now.getFullYear() &&
				d.getMonth() === now.getMonth() &&
				d.getDate() === now.getDate();
			const yesterday = new Date(now);
			yesterday.setDate(yesterday.getDate() - 1);
			const isYesterday =
				d.getFullYear() === yesterday.getFullYear() &&
				d.getMonth() === yesterday.getMonth() &&
				d.getDate() === yesterday.getDate();
			const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
			if (sameDay) return `Today, ${time}`;
			if (isYesterday) return `Yesterday`;
			return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
		} catch {
			return iso;
		}
	};

	const isCommitHash = (s: string): boolean => /^[a-f0-9]{6,40}$/i.test(s);

	type DisplayRelease = {
		release: PublishedRelease;
		title: string;
		titleIsHash: boolean;
		isLive: boolean;
		paths: string[];
		extraPaths: number;
	};

	const displayList = $derived.by<DisplayRelease[]>(() =>
		history.map((release, idx) => {
			const title = release.name ?? release.id.slice(0, 8);
			const titleIsHash = !release.name && isCommitHash(title);
			const isLive = idx === 0 && !release.revertedAt;

			const seen = new Set<string>();
			const allPaths: string[] = [];
			for (const item of release.items) {
				let path: string;
				if (item.kind === 'layout') {
					path = resolveRouteOnlyParams(item.routeId);
				} else {
					try {
						path = resolveRouteUrl(item.routeId, item.params);
					} catch {
						path = resolveRouteOnlyParams(item.routeId);
					}
				}
				if (!seen.has(path)) {
					seen.add(path);
					allPaths.push(path);
				}
			}
			const cap = 3;
			const paths = allPaths.slice(0, cap);
			const extraPaths = Math.max(0, allPaths.length - cap);
			return { release, title, titleIsHash, isLive, paths, extraPaths };
		})
	);

	const onView = (_release: PublishedRelease) => {
		// Stub — opening release diff/preview is a future feature (DESIGN §6.2).
	};
</script>

<Panel ariaLabel="Recent releases" {onClose}>
	<PanelHeader title="Recent releases" {onClose}>
		{#snippet subtitle()}
			<span class="vela:text-[12px] vela:text-bar-text-secondary">last 30 days</span>
		{/snippet}
	</PanelHeader>

	<div class="vela:overflow-y-auto vela:px-4 vela:pb-2">
		{#if loading && history.length === 0}
			<p class="vela:text-[13px] vela:text-bar-text-tertiary vela:py-2">Loading…</p>
		{:else if history.length === 0}
			<p class="vela:text-[13px] vela:text-bar-text-tertiary vela:py-2">
				No published releases yet.
			</p>
		{:else}
			<ol class="vela:list-none vela:pl-0 vela:m-0 vela:relative vela:flex vela:flex-col">
				<span
					class="vela:absolute vela:left-[5px] vela:top-2 vela:bottom-2 vela:w-px vela:bg-[var(--cms-bar-divider)]"
					aria-hidden="true"
				></span>
				{#each displayList as { release, title, titleIsHash, isLive, paths, extraPaths } (release.id)}
					<li class="vela:relative vela:pl-6 vela:pr-1 vela:py-2.5">
						<span
							class="vela:absolute vela:left-0 vela:top-3.5 vela:w-[11px] vela:h-[11px]
								vela:rounded-full vela:bg-bar-bg vela:flex vela:items-center vela:justify-center"
							aria-hidden="true"
						>
							<span
								class="vela:w-2 vela:h-2 vela:rounded-full"
								style:background-color={isLive ? 'var(--cms-status-clean-dot)' : '#444'}
							></span>
						</span>
						<div class="vela:flex vela:items-start vela:justify-between vela:gap-3">
							<div class="vela:flex vela:flex-col vela:min-w-0 vela:flex-1">
								<div class="vela:flex vela:items-center vela:gap-2 vela:min-w-0">
									{#if titleIsHash}
										<span
											class="vela:font-mono vela:text-[12px] vela:text-bar-text vela:truncate"
										>
											{title}
										</span>
									{:else}
										<span
											class="vela:text-[13px] vela:font-medium vela:text-bar-text vela:truncate"
										>
											{title}
										</span>
									{/if}
									{#if release.revertedAt}
										<Badge variant="warn" size="sm">reverted</Badge>
									{/if}
								</div>
								<div class="vela:text-[11px] vela:text-bar-text-tertiary vela:mt-0.5">
									{formatDate(release.publishedAt)} · published by {release.publishedBy}{isLive
										? ' · '
										: ''}{#if isLive}<span class="vela:text-[var(--cms-status-clean-dot)]"
											>live now</span
										>{/if}
								</div>
								{#if paths.length > 0}
									<div class="vela:flex vela:flex-wrap vela:gap-1.5 vela:mt-2">
										{#each paths as path}
											<span
												class="vela:font-mono vela:text-[11px] vela:px-1.5 vela:py-0.5 vela:rounded
													vela:bg-[var(--cms-bar-bg-hover)] vela:text-bar-text-secondary"
											>
												{path}
											</span>
										{/each}
										{#if extraPaths > 0}
											<span
												class="vela:text-[11px] vela:text-bar-text-tertiary vela:px-1 vela:py-0.5"
											>
												+{extraPaths} more
											</span>
										{/if}
									</div>
								{/if}
							</div>
							<div class="vela:flex vela:items-center vela:gap-1.5 vela:shrink-0">
								<Button variant="outline" size="pill" onclick={() => onView(release)}>
									View
								</Button>
								{#if !isLive}
									<Button
										variant="outline"
										size="pill"
										disabled={reverting === release.id || !!release.revertedAt}
										onclick={() => onRevert(release)}
									>
										{reverting === release.id ? '…' : 'Revert'}
									</Button>
								{/if}
							</div>
						</div>
					</li>
				{/each}
			</ol>
		{/if}
	</div>

	<PanelFooter>
		<span>
			{history.length}
			{history.length === 1 ? 'release' : 'releases'} shown
		</span>
		<Button variant="link" size="xs" disabled class="vela:text-bar-text-tertiary">
			Load older →
		</Button>
	</PanelFooter>
</Panel>
