<script lang="ts">
	import UploadIcon from '@lucide/svelte/icons/upload';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import AlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { Button } from '../admin-bar/ui/button/index.js';
	import { cmsStore, type MediaItem } from './cms-store.svelte.js';

	type Props = {
		endpoint: string;
		onSelect: (item: MediaItem) => void;
	};
	let { endpoint, onSelect }: Props = $props();

	const PAGE_SIZE = 24;

	let items = $state<MediaItem[]>([]);
	let total = $state(0);
	let offset = $state(0);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let uploading = $state(false);
	let fileInputEl: HTMLInputElement | null = $state(null);

	const fetchPage = async () => {
		loading = true;
		try {
			const res = await cmsStore.listMedia(endpoint, { offset, limit: PAGE_SIZE });
			items = res.items;
			total = res.total;
			error = null;
		} catch {
			error = 'Could not load media.';
		} finally {
			loading = false;
		}
	};

	$effect(() => {
		void offset;
		void fetchPage();
	});

	const upload = async (file: File) => {
		if (!file.type.startsWith('image/')) {
			error = 'Only image files are supported.';
			return;
		}
		error = null;
		uploading = true;
		try {
			const item = await cmsStore.uploadMedia(endpoint, file);
			onSelect(item);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Upload failed';
		} finally {
			uploading = false;
		}
	};

	const onPickerChange = () => {
		const file = fileInputEl?.files?.[0];
		if (file) void upload(file);
		if (fileInputEl) fileInputEl.value = '';
	};

	const rangeLabel = $derived.by(() => {
		if (total === 0) return '';
		const start = offset + 1;
		const end = Math.min(offset + items.length, total);
		return `${start}–${end} of ${total}`;
	});

	const canPrev = $derived(offset > 0);
	const canNext = $derived(offset + items.length < total);
</script>

<div class="vela:flex vela:flex-col vela:gap-2 vela:w-[420px]">
	<div class="vela:flex vela:items-center vela:justify-between vela:gap-2">
		<Button size="xs" variant="default" onclick={() => fileInputEl?.click()}>
			<UploadIcon class="vela:size-3.5" />
			Upload &amp; use
		</Button>
		<span class="vela:text-[11px] vela:text-bar-text-tertiary">{rangeLabel}</span>
	</div>

	<input bind:this={fileInputEl} type="file" accept="image/*" hidden onchange={onPickerChange} />

	{#if error}
		<div
			class="vela:flex vela:items-center vela:gap-2 vela:px-2 vela:py-1 vela:rounded-md vela:text-[12px]"
			style:background="var(--cms-status-error-bg-hover)"
			style:color="var(--cms-status-error-text-base)"
			role="alert"
		>
			<AlertIcon class="vela:size-3.5" />
			<span>{error}</span>
		</div>
	{/if}

	{#if (loading && items.length === 0) || uploading}
		<div
			class="vela:flex vela:items-center vela:justify-center vela:py-8 vela:text-bar-text-tertiary"
		>
			<LoaderIcon class="vela:size-5 vela:animate-spin" />
		</div>
	{:else if items.length === 0}
		<div class="vela:py-8 vela:text-center vela:text-[12px] vela:text-bar-text-tertiary">
			No media yet — upload an image to get started.
		</div>
	{:else}
		<div class="vela:grid vela:grid-cols-4 vela:gap-1.5 vela:max-h-[280px] vela:overflow-y-auto">
			{#each items as item (item.id)}
				<button
					type="button"
					class="vela:relative vela:aspect-square vela:rounded vela:overflow-hidden vela:bg-[var(--cms-bar-bg-hover)] vela:border-0 vela:p-0 vela:cursor-pointer vela:hover:ring-2 vela:hover:ring-[var(--cms-accent,#534ab7)]"
					title={item.originalName}
					onclick={() => onSelect(item)}
				>
					<img
						src={item.url}
						alt={item.originalName}
						loading="lazy"
						class="vela:size-full vela:object-cover"
					/>
				</button>
			{/each}
		</div>
	{/if}

	{#if canPrev || canNext}
		<div class="vela:flex vela:items-center vela:justify-end vela:gap-1 vela:pt-1">
			<Button
				size="xs"
				variant="ghost"
				disabled={!canPrev}
				onclick={() => (offset = Math.max(0, offset - PAGE_SIZE))}
			>
				Prev
			</Button>
			<Button
				size="xs"
				variant="ghost"
				disabled={!canNext}
				onclick={() => (offset = offset + PAGE_SIZE)}
			>
				Next
			</Button>
		</div>
	{/if}
</div>
