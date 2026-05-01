<script lang="ts">
	import { tick as svelteTick } from 'svelte';
	import { page } from '$app/state';
	import { cmsStore, type CmsScopeRef, type MediaItem } from './cms-store.svelte.js';
	import { Button } from '../admin-bar/ui/button/index.js';
	import { Input } from '../admin-bar/ui/input/index.js';
	import CssRoot from '../admin-bar/css-root.svelte';
	import { clickOutside } from '../admin-bar/click-outside.js';
	import CmsMediaPicker from './cms-media-picker.svelte';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import LinkIcon from '@lucide/svelte/icons/link';
	import ImagesIcon from '@lucide/svelte/icons/images';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import CheckIcon from '@lucide/svelte/icons/check';
	import XIcon from '@lucide/svelte/icons/x';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import AlertIcon from '@lucide/svelte/icons/triangle-alert';

	type Props = {
		scope: CmsScopeRef;
		name: string;
		alt: string;
		initial: string;
	};
	let { scope, name, alt, initial }: Props = $props();

	const current = $derived.by(() => {
		const draft = cmsStore.getValue(scope, name);
		return typeof draft === 'string' ? draft : initial;
	});
	const endpoint = $derived(page.data.cms?.endpoint ?? '/api/cms');

	let mode: 'idle' | 'url' = $state('idle');
	let urlValue = $state('');
	let urlInputEl: HTMLInputElement | null = $state(null);
	let fileInputEl: HTMLInputElement | null = $state(null);
	let libraryOpen = $state(false);

	let dragDepth = $state(0);
	const dragging = $derived(dragDepth > 0);

	let uploading = $state(false);
	let error: string | null = $state(null);

	const setValue = (v: string) => cmsStore.setValue(scope, name, v);

	const upload = async (file: File) => {
		if (!file.type.startsWith('image/')) {
			error = 'Only image files are supported.';
			return;
		}
		error = null;
		uploading = true;
		try {
			const url = await cmsStore.uploadImage(endpoint, file);
			setValue(url);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Upload failed';
		} finally {
			uploading = false;
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
		const file = e.dataTransfer?.files?.[0];
		if (file) upload(file);
	};

	const onPickerChange = () => {
		const file = fileInputEl?.files?.[0];
		if (file) upload(file);
		if (fileInputEl) fileInputEl.value = '';
	};

	const openPicker = (e: Event) => {
		e.preventDefault();
		e.stopPropagation();
		fileInputEl?.click();
	};

	const enterUrlMode = async (e: Event) => {
		e.preventDefault();
		e.stopPropagation();
		urlValue = current;
		mode = 'url';
		await svelteTick();
		urlInputEl?.focus();
		urlInputEl?.select();
	};

	const applyUrl = (e?: Event) => {
		e?.preventDefault();
		e?.stopPropagation();
		const v = urlValue.trim();
		if (v !== current) setValue(v);
		mode = 'idle';
	};
	const cancelUrl = (e?: Event) => {
		e?.preventDefault();
		e?.stopPropagation();
		mode = 'idle';
	};
	const onUrlKey = (e: KeyboardEvent) => {
		if (e.key === 'Enter') applyUrl(e);
		else if (e.key === 'Escape') cancelUrl(e);
	};

	const remove = (e: Event) => {
		e.preventDefault();
		e.stopPropagation();
		setValue('');
	};

	const toggleLibrary = (e: Event) => {
		e.preventDefault();
		e.stopPropagation();
		libraryOpen = !libraryOpen;
	};

	const onLibrarySelect = (item: MediaItem) => {
		setValue(item.url);
		libraryOpen = false;
	};

	const onLibraryKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape' && libraryOpen) {
			e.preventDefault();
			e.stopPropagation();
			libraryOpen = false;
		}
	};

	const dismissError = (e: Event) => {
		e.preventDefault();
		e.stopPropagation();
		error = null;
	};

	const stopMouseDown = (e: MouseEvent) => e.preventDefault();
</script>

<CssRoot>
<span
	class="cms-image-edit"
	class:dragging
	role="region"
	aria-label={`Image slot ${name}`}
	ondragenter={onDragEnter}
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={onDrop}
>
	<button
		type="button"
		class="cms-image-edit__pick"
		onclick={openPicker}
		aria-label={current ? `Replace image for ${name}` : `Upload image for ${name}`}
	>
		{#if current}
			<img class="cms-image" src={current} {alt} draggable="false" />
		{:else}
			<span class="cms-image-edit__empty" data-cms-name={name}>{name}</span>
		{/if}
	</button>

	<input
		bind:this={fileInputEl}
		type="file"
		accept="image/*"
		hidden
		onchange={onPickerChange}
	/>

	<div
		class="cms-image-edit__toolbar"
		role="toolbar"
		tabindex="-1"
		aria-label="Image actions"
		onmousedown={stopMouseDown}
	>
		{#if mode === 'idle'}
			<Button size="xs" variant="ghost" onclick={openPicker}>
				<UploadIcon class="vela:size-3.5" />
				Upload
			</Button>
			<Button size="xs" variant="ghost" onclick={toggleLibrary}>
				<ImagesIcon class="vela:size-3.5" />
				Library
			</Button>
			<Button size="xs" variant="ghost" onclick={enterUrlMode}>
				<LinkIcon class="vela:size-3.5" />
				URL
			</Button>
			{#if current}
				<Button size="xs" variant="ghost" onclick={remove} aria-label="Remove image">
					<TrashIcon class="vela:size-3.5" />
				</Button>
			{/if}
		{:else}
			<Input
				bind:ref={urlInputEl}
				bind:value={urlValue}
				type="url"
				placeholder="https://example.com/image.jpg"
				onkeydown={onUrlKey}
				class="vela:h-7 vela:w-72 vela:text-xs"
			/>
			<Button size="icon" variant="ghost" aria-label="Apply URL" onclick={applyUrl}>
				<CheckIcon class="vela:size-4" />
			</Button>
			<Button size="icon" variant="ghost" aria-label="Cancel" onclick={cancelUrl}>
				<XIcon class="vela:size-4" />
			</Button>
		{/if}
	</div>

	{#if libraryOpen}
		<div
			class="cms-image-edit__library"
			role="dialog"
			tabindex="-1"
			aria-label="Choose from media library"
			onmousedown={stopMouseDown}
			onkeydown={onLibraryKey}
			use:clickOutside={() => (libraryOpen = false)}
		>
			<CmsMediaPicker {endpoint} onSelect={onLibrarySelect} />
		</div>
	{/if}

	{#if dragging}
		<div class="cms-image-edit__overlay cms-image-edit__overlay--drop">
			<UploadIcon class="vela:size-6" />
			<span>Drop to upload</span>
		</div>
	{/if}

	{#if uploading}
		<div class="cms-image-edit__overlay cms-image-edit__overlay--uploading">
			<LoaderIcon class="vela:size-5 vela:animate-spin" />
		</div>
	{/if}

	{#if error}
		<div class="cms-image-edit__error" role="alert">
			<AlertIcon class="vela:size-3.5" />
			<span>{error}</span>
			<button
				type="button"
				class="cms-image-edit__error-dismiss"
				aria-label="Dismiss error"
				onclick={dismissError}
			>×</button>
		</div>
	{/if}
</span>
</CssRoot>

<style>
	.cms-image-edit {
		position: relative;
		display: inline-block;
		vertical-align: top;
		border-radius: 0.125rem;
		outline: 1px dashed rgba(127, 127, 127, 0.6);
		outline-offset: 2px;
	}
	.cms-image-edit:hover,
	.cms-image-edit:focus-within,
	.cms-image-edit.dragging {
		outline: 2px solid var(--cms-accent, #534ab7);
		outline-offset: 2px;
	}
	.cms-image-edit__pick {
		display: block;
		padding: 0;
		margin: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.cms-image-edit__pick :global(.cms-image) {
		display: block;
		max-width: 100%;
		height: auto;
	}
	.cms-image-edit__empty {
		display: inline-block;
		padding: 0.5rem 0.75rem;
		font-family: ui-monospace, monospace;
		font-size: 0.85em;
		color: rgba(127, 127, 127, 0.9);
	}
	.cms-image-edit__toolbar {
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
	}
	.cms-image-edit:hover .cms-image-edit__toolbar,
	.cms-image-edit:focus-within .cms-image-edit__toolbar {
		display: inline-flex;
	}
	.cms-image-edit__library {
		position: absolute;
		top: 0;
		left: 0;
		transform: translateY(calc(-100% - 0.5rem));
		padding: 0.5rem;
		background: var(--cms-bar-bg, #1f1f1f);
		border: 1px solid var(--cms-bar-divider, #3a3a3a);
		border-radius: 0.5rem;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
		color: var(--cms-bar-text, #f5f5f5);
		z-index: 60;
	}
	.cms-image-edit__overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		gap: 0.5rem;
		border-radius: 0.25rem;
		pointer-events: none;
		z-index: 10;
		color: white;
		font-weight: 600;
		font-size: 0.875rem;
	}
	.cms-image-edit__overlay--drop {
		background: rgba(83, 74, 183, 0.85);
	}
	.cms-image-edit__overlay--uploading {
		background: rgba(0, 0, 0, 0.55);
	}
	.cms-image-edit__error {
		position: absolute;
		left: 0;
		bottom: 0;
		transform: translateY(calc(100% + 0.375rem));
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		background: var(--cms-status-error-bg-hover, #fee2e2);
		color: var(--cms-status-error-text-base, #991b1b);
		border: 1px solid var(--cms-status-error-border, #fecaca);
		border-radius: 0.25rem;
		font-size: 0.8125rem;
		z-index: 20;
		white-space: nowrap;
	}
	.cms-image-edit__error-dismiss {
		background: transparent;
		border: 0;
		color: inherit;
		cursor: pointer;
		font-size: 1.1em;
		line-height: 1;
		padding: 0 0.125rem;
	}
</style>
