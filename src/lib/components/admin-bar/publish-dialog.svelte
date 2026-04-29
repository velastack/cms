<script lang="ts">
	import type { ReleaseItem } from '../cms/cms-store.svelte.js';
	import { resolveRouteOnlyParams, resolveRouteUrl } from './resolve-route.js';
	import { Badge, type BadgeVariant } from './ui/badge/index.js';
	import { Button } from './ui/button/index.js';
	import * as Dialog from './ui/dialog/index.js';
	import { Input } from './ui/input/index.js';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		items: ReleaseItem[];
		publishing: boolean;
		error: string | null;
		user: { name: string };
		endpoint: string;
		onConfirm: (name: string | undefined) => void;
	};
	let { open, onOpenChange, items, publishing, error, user, endpoint, onConfirm }: Props = $props();

	const itemKey = (item: ReleaseItem): string => {
		if (item.kind === 'layout') return `layout:${item.routeId}`;
		const prefix = item.kind === 'page-delete' ? 'page-delete' : 'page';
		return `${prefix}:${item.routeId}?${JSON.stringify(item.params)}`;
	};

	let releaseName = $state('');
	let draftPageKeys = $state<Set<string>>(new Set());

	const initials = $derived(
		user.name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('')
	);

	// Fetch the page map once on open so we can distinguish "new page" items
	// (page kind, no published entry yet) from "edited" or "SEO-only" items.
	$effect(() => {
		if (!open) return;
		void (async () => {
			try {
				const res = await fetch(`${endpoint}/pages`);
				if (!res.ok) return;
				const data = (await res.json()) as {
					routes: Array<{
						routeId: string;
						entries: Array<{ params: Record<string, string>; isDraft: boolean }>;
					}>;
				};
				const set = new Set<string>();
				for (const r of data.routes) {
					for (const e of r.entries) {
						if (e.isDraft) set.add(`page:${r.routeId}?${JSON.stringify(e.params)}`);
					}
				}
				draftPageKeys = set;
			} catch {
				/* leave empty — items default to "edited" classification */
			}
		})();
	});

	type ChangeType = 'edited' | 'new' | 'delete' | 'seo';

	const fieldNames = (fields: Record<string, unknown>): string[] => {
		const out: string[] = [];
		for (const k of Object.keys(fields)) {
			if (k === '_metadata') continue;
			out.push(k);
		}
		return out;
	};

	const metadataKeys = (fields: Record<string, unknown>): string[] => {
		const meta = fields._metadata;
		if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return [];
		return Object.keys(meta as Record<string, unknown>);
	};

	const changeTypeOf = (item: ReleaseItem): ChangeType => {
		if (item.kind === 'page-delete') return 'delete';
		if (item.kind === 'layout') return 'edited';
		if (draftPageKeys.has(itemKey(item))) return 'new';
		const nonMeta = fieldNames(item.fields);
		if (nonMeta.length === 0 && metadataKeys(item.fields).length > 0) return 'seo';
		return 'edited';
	};

	const labelFor = (item: ReleaseItem): string => {
		if (item.kind === 'layout') return resolveRouteOnlyParams(item.routeId);
		try {
			return resolveRouteUrl(item.routeId, item.params);
		} catch {
			return resolveRouteOnlyParams(item.routeId);
		}
	};

	const summarizeNames = (names: string[], verb: string): string => {
		if (names.length === 0) return verb;
		if (names.length === 1) return `${verb} ${names[0]}`;
		return `${verb} ${names[0]} +${names.length - 1} more`;
	};

	const metaTextFor = (item: ReleaseItem): string => {
		if (item.kind === 'page-delete') return 'Marked for deletion';
		if (item.kind === 'layout') return summarizeNames(fieldNames(item.fields), 'Edited');
		if (changeTypeOf(item) === 'new') return 'Created';
		const non = fieldNames(item.fields);
		if (non.length > 0) return summarizeNames(non, 'Edited');
		return summarizeNames(metadataKeys(item.fields), 'Updated');
	};

	const formatRelative = (iso: string): string => {
		const t = new Date(iso).getTime();
		if (Number.isNaN(t)) return '';
		const now = Date.now();
		const seconds = Math.max(0, Math.floor((now - t) / 1000));
		if (seconds < 45) return 'just now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return minutes <= 1 ? '1 minute ago' : `${minutes} minutes ago`;
		const d = new Date(t);
		const today = new Date(now);
		const sameDay =
			d.getFullYear() === today.getFullYear() &&
			d.getMonth() === today.getMonth() &&
			d.getDate() === today.getDate();
		if (sameDay) {
			const h = d.getHours();
			if (h < 12) return 'this morning';
			if (h < 17) return 'this afternoon';
			return 'this evening';
		}
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		const isYesterday =
			d.getFullYear() === yesterday.getFullYear() &&
			d.getMonth() === yesterday.getMonth() &&
			d.getDate() === yesterday.getDate();
		if (isYesterday) return 'yesterday';
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	};

	const total = $derived(items.length);

	const submit = () => {
		if (publishing || total === 0) return;
		const trimmed = releaseName.trim();
		onConfirm(trimmed === '' ? undefined : trimmed);
	};

	const badgeVariantOf = (t: ChangeType): BadgeVariant => {
		if (t === 'edited') return 'warn';
		if (t === 'new') return 'success';
		if (t === 'delete') return 'destructive';
		return 'edit';
	};
	const badgeLabel = (t: ChangeType): string => (t === 'seo' ? 'SEO' : t);
</script>

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		// Block close while publishing — `Cancel` and overlay click route through here.
		if (!next && publishing) return;
		onOpenChange(next);
	}}
>
	<Dialog.Content showCloseButton={false} class="vela:max-w-[30rem] vela:p-0">
		<form
			class="vela:flex vela:flex-col vela:gap-0"
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<Dialog.Header class="vela:gap-1 vela:px-6 vela:pt-5 vela:pb-4">
				<Dialog.Title>Review &amp; publish</Dialog.Title>
				<Dialog.Description>All changes will go live together.</Dialog.Description>
			</Dialog.Header>

			<ul
				class="vela:list-none vela:m-0 vela:px-6 vela:pb-4 vela:flex vela:flex-col vela:gap-3 vela:overflow-y-auto vela:max-h-[40vh]"
			>
				{#each items as item (itemKey(item))}
					{@const t = changeTypeOf(item)}
					<li class="vela:flex vela:items-start vela:gap-3">
						<span class="vela:flex vela:flex-col vela:min-w-0 vela:flex-1">
							<span class="vela:font-mono vela:text-[14px] vela:text-bar-text vela:truncate">
								{labelFor(item)}
							</span>
							<span class="vela:mt-0.5 vela:text-[12px] vela:text-bar-text-secondary vela:truncate">
								{metaTextFor(item)} · {formatRelative(item.addedAt)}
							</span>
						</span>
						<Badge variant={badgeVariantOf(t)} class="vela:shrink-0 vela:mt-0.5">
							{badgeLabel(t)}
						</Badge>
					</li>
				{/each}
			</ul>

			<div
				class="vela:px-6 vela:pt-4 vela:pb-3 vela:flex vela:flex-col vela:gap-1.5
					vela:border-t vela:border-[var(--cms-bar-divider)]"
			>
				<div class="vela:flex vela:items-baseline vela:justify-between">
					<label for="vela-release-name" class="vela:text-[13px] vela:text-bar-text">
						Release name <span class="vela:text-bar-text-tertiary">(optional)</span>
					</label>
					<span class="vela:text-[12px] vela:text-bar-text-tertiary"
						>Helps you find it in History</span
					>
				</div>
				<Input
					id="vela-release-name"
					placeholder="Spring relaunch"
					bind:value={releaseName}
					disabled={publishing}
					class="vela:bg-[var(--cms-bar-bg-hover)]"
				/>
			</div>

			{#if error}
				<p
					role="alert"
					class="vela:mx-6 vela:mb-2 vela:px-3 vela:py-2 vela:rounded-md
						vela:bg-[#2a1818] vela:text-[#F08A8A] vela:text-[12px]"
				>
					{error}
				</p>
			{/if}

			<Dialog.Footer>
				<span class="vela:text-[12px] vela:text-bar-text-secondary">
					Publishing as <span class="vela:font-medium vela:text-bar-text">{initials}</span>
				</span>
				<div class="vela:flex vela:items-center vela:gap-2">
					<Button variant="ghost" onclick={() => onOpenChange(false)} disabled={publishing}>
						Cancel
					</Button>
					<Button type="submit" disabled={publishing || total === 0}>
						{#if publishing}
							Publishing…
						{:else}
							Publish {total}
							{total === 1 ? 'change' : 'changes'}
						{/if}
					</Button>
				</div>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
