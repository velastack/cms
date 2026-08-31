<script lang="ts">
	import UploadIcon from './icons/upload.svelte';
	import TrashIcon from './icons/trash-2.svelte';
	import LoaderIcon from './icons/loader-circle.svelte';
	import AlertIcon from './icons/triangle-alert.svelte';
	import CheckIcon from './icons/check.svelte';
	import { cmsStore } from '../cms/cms-store.svelte.js';
	import type { MediaItem } from '../cms/cms-store.svelte.js';
	import PanelFooter from './panel-footer.svelte';
	import PanelHeader from './panel-header.svelte';
	import Panel from './panel.svelte';
	import { Button } from './ui/button/index.js';

	type Props = {
		endpoint: string;
		onClose: () => void;
	};
	let { endpoint, onClose }: Props = $props();

	const PAGE_SIZE = 24;

	let items = $state<MediaItem[]>([]);
	let total = $state(0);
	let offset = $state(0);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let dragDepth = $state(0);
	const dragging = $derived(dragDepth > 0);

	let uploading = $state(false);
	let copiedId = $state<string | null>(null);
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
		void offset; // re-run when offset changes
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
			// Optimistic prepend; reset to first page so it's visible.
			if (offset === 0) {
				items = [item, ...items].slice(0, PAGE_SIZE);
				total += 1;
			} else {
				offset = 0;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Upload failed';
		} finally {
			uploading = false;
		}
	};

	const onPickerChange = () => {
		const files = fileInputEl?.files;
		if (!files) return;
		for (const f of files) void upload(f);
		if (fileInputEl) fileInputEl.value = '';
	};

	const remove = async (item: MediaItem) => {
		try {
			await cmsStore.deleteMedia(endpoint, item.id);
			items = items.filter((i) => i.id !== item.id);
			total = Math.max(0, total - 1);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Delete failed';
		}
	};

	const copyUrl = async (item: MediaItem) => {
		try {
			await navigator.clipboard.writeText(item.url);
			copiedId = item.id;
			setTimeout(() => {
				if (copiedId === item.id) copiedId = null;
			}, 1500);
		} catch {
			// clipboard may be unavailable; ignore silently
		}
	};

	const onDragEnter = (e: DragEvent) => {
		if (!e.dataTransfer?.types.includes('Files')) return;
		e.preventDefault();
		dragDepth++;
	};
	const onDragOver = (e: DragEvent) => {
		if (!e.dataTransfer?.types.includes('Files')) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
	};
	const onDragLeave = (e: DragEvent) => {
		e.preventDefault();
		dragDepth = Math.max(0, dragDepth - 1);
	};
	const onDrop = (e: DragEvent) => {
		e.preventDefault();
		dragDepth = 0;
		const files = e.dataTransfer?.files;
		if (!files) return;
		for (const f of files) void upload(f);
	};

	const rangeLabel = $derived.by(() => {
		if (total === 0) return '0 of 0';
		const start = offset + 1;
		const end = Math.min(offset + items.length, total);
		return `${start}–${end} of ${total}`;
	});

	const canPrev = $derived(offset > 0);
	const canNext = $derived(offset + items.length < total);

	const formatSize = (bytes: number): string => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};
</script>

<Panel ariaLabel="Media Library" {onClose}>
	<PanelHeader title="Media Library" {onClose} />

	<div
		class="vela:relative vela:flex vela:flex-col vela:gap-3 vela:px-4 vela:pb-3 vela:overflow-y-auto"
		class:dragging
		ondragenter={onDragEnter}
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
		role="region"
		aria-label="Media uploads"
	>
		<div class="vela:flex vela:items-center vela:gap-2">
			<Button size="sm" variant="default" onclick={() => fileInputEl?.click()}>
				<UploadIcon class="vela:size-3.5" />
				Upload
			</Button>
			<span class="vela:text-[12px] vela:text-bar-text-tertiary">
				or drag &amp; drop images here
			</span>
		</div>

		<input
			bind:this={fileInputEl}
			type="file"
			accept="image/*"
			multiple
			hidden
			onchange={onPickerChange}
		/>

		{#if error}
			<div
				class="vela:flex vela:items-center vela:gap-2 vela:px-2.5 vela:py-1.5 vela:rounded-md vela:text-[12px]"
				style:background="var(--cms-status-error-bg-hover)"
				style:color="var(--cms-status-error-text-base)"
				role="alert"
			>
				<AlertIcon class="vela:size-3.5" />
				<span>{error}</span>
			</div>
		{/if}

		{#if loading && items.length === 0}
			<div
				class="vela:flex vela:items-center vela:justify-center vela:py-12 vela:text-bar-text-tertiary"
			>
				<LoaderIcon class="vela:size-5 vela:animate-spin" />
			</div>
		{:else if items.length === 0}
			<div
				class="vela:flex vela:flex-col vela:items-center vela:justify-center vela:py-12 vela:text-[13px] vela:text-bar-text-tertiary"
			>
				<UploadIcon class="vela:size-6 vela:mb-2 vela:opacity-50" />
				<span>No media yet — upload an image to get started.</span>
			</div>
		{:else}
			<div class="vela:grid vela:grid-cols-3 vela:sm:grid-cols-4 vela:gap-2">
				{#each items as item (item.id)}
					<div
						class="vela:relative vela:group vela:aspect-square vela:rounded-md vela:overflow-hidden vela:bg-[var(--cms-bar-bg-hover)]"
					>
						<button
							type="button"
							class="vela:block vela:size-full vela:cursor-pointer vela:bg-transparent vela:border-0 vela:p-0"
							title={`${item.originalName} · ${formatSize(item.size)} — click to copy URL`}
							onclick={() => copyUrl(item)}
						>
							<img
								src={item.url}
								alt={item.originalName}
								loading="lazy"
								class="vela:size-full vela:object-cover"
							/>
						</button>
						<button
							type="button"
							class="vela:absolute vela:top-1 vela:right-1 vela:size-6 vela:rounded vela:bg-black/60 vela:text-white vela:flex vela:items-center vela:justify-center vela:cursor-pointer vela:opacity-0 vela:group-hover:opacity-100 vela:transition-opacity"
							aria-label={`Delete ${item.originalName}`}
							onclick={() => remove(item)}
						>
							<TrashIcon class="vela:size-3.5" />
						</button>
						{#if copiedId === item.id}
							<div
								class="vela:absolute vela:inset-0 vela:flex vela:items-center vela:justify-center vela:bg-black/55 vela:text-white vela:text-[12px] vela:font-medium vela:gap-1"
							>
								<CheckIcon class="vela:size-4" />
								Copied
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if uploading}
			<div
				class="vela:absolute vela:inset-0 vela:flex vela:items-center vela:justify-center vela:bg-black/35 vela:pointer-events-none"
			>
				<LoaderIcon class="vela:size-6 vela:animate-spin vela:text-white" />
			</div>
		{/if}

		{#if dragging}
			<div
				class="vela:absolute vela:inset-0 vela:flex vela:flex-col vela:items-center vela:justify-center vela:gap-2 vela:text-white vela:font-semibold vela:pointer-events-none"
				style:background="rgba(83, 74, 183, 0.85)"
			>
				<UploadIcon class="vela:size-6" />
				<span>Drop to upload</span>
			</div>
		{/if}
	</div>

	<PanelFooter>
		<span>{rangeLabel}</span>
		<div class="vela:flex vela:items-center vela:gap-1">
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
	</PanelFooter>
</Panel>
