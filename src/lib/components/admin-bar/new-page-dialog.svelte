<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { normalizeField, type CmsCreatablePageConfigWithRouteId } from './page-config.js';
	import { Button } from './ui/button/index.js';
	import * as Dialog from './ui/dialog/index.js';
	import { Input } from './ui/input/index.js';
	import { Label } from './ui/label/index.js';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		config: CmsCreatablePageConfigWithRouteId;
		creating: boolean;
		error: string | null;
		onCreate: (values: Record<string, string>) => void;
		mode?: 'new' | 'duplicate' | 'rename';
		initialValues?: Record<string, string>;
	};

	let {
		open,
		onOpenChange,
		config,
		creating,
		error,
		onCreate,
		mode = 'new',
		initialValues = {}
	}: Props = $props();

	let values = new SvelteMap<string, string>();

	const fields = $derived(config.fields.map(normalizeField));

	// `open` switches to true when (re)opening — seed values from initialValues
	// then. Without keying off `open`, the dialog keeps the previous session's
	// values around (a duplicate from the same row would re-show them).
	$effect.pre(() => {
		if (!open) return;
		values.clear();
		for (const f of fields) values.set(f.name, initialValues[f.name] ?? '');
	});

	const allFilled = $derived(fields.every((f) => (values.get(f.name) ?? '').trim() !== ''));

	const submit = () => {
		if (!allFilled || creating) return;
		const out: Record<string, string> = {};
		for (const f of fields) out[f.name] = values.get(f.name) ?? '';
		onCreate(out);
	};
</script>

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		if (!next && creating) return;
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
				<Dialog.Title>
					{mode === 'duplicate' ? 'Duplicate' : mode === 'rename' ? 'Rename' : 'New'}
					{config.type}
				</Dialog.Title>
				{#if mode === 'rename'}
					<Dialog.Description>
						Creates a new page with the same content and redirects the old URL.
					</Dialog.Description>
				{/if}
			</Dialog.Header>

			<div class="vela:px-6 vela:pb-2 vela:flex vela:flex-col vela:gap-3">
				{#each fields as f (f.name)}
					<div class="vela:flex vela:flex-col vela:gap-1.5">
						<Label for={`vela-new-page-${f.name}`}>{f.label}</Label>
						<Input
							id={`vela-new-page-${f.name}`}
							placeholder={f.placeholder}
							value={values.get(f.name) ?? ''}
							oninput={(e) => values.set(f.name, e.currentTarget.value)}
							disabled={creating}
						/>
					</div>
				{/each}
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
				<Button variant="ghost" onclick={() => onOpenChange(false)} disabled={creating}>
					Cancel
				</Button>
				<Button type="submit" disabled={!allFilled || creating}>
					{creating
						? mode === 'duplicate'
							? 'Duplicating…'
							: mode === 'rename'
								? 'Renaming…'
								: 'Creating…'
						: mode === 'duplicate'
							? 'Duplicate'
							: mode === 'rename'
								? 'Rename'
								: 'Create'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
