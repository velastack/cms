<script lang="ts" module>
	/** `CmsWhatsAppForm`: a form whose answers open a prefilled WhatsApp chat. */
	import { getContext } from 'svelte';
	import { isControlField } from '../../core/forms/target.js';
	import type { CmsFormState } from './cms-form.svelte';

	export * from '../../core/shapes/whatsapp.js';

	export type CmsWhatsAppFormState = CmsFormState & {
		/** A chat link with no message, for a `<noscript>` fallback; `null` without a number. */
		readonly whatsappHref: string | null;
	};

	const FIELD_NAMES = Symbol('vela-cms:whatsapp-field-names');

	/** For the settings editor: the `{placeholders}` this form's inputs provide. */
	export const getWhatsAppFieldNames = (): (() => string[]) =>
		getContext<() => string[]>(FIELD_NAMES) ?? (() => []);

	const fieldNames = (form: HTMLFormElement): string[] => {
		const names = new Set<string>();
		for (const el of form.elements) {
			const name = (el as HTMLInputElement).name;
			const type = (el as HTMLInputElement).type;
			if (name && !isControlField(name) && type !== 'submit' && type !== 'button') names.add(name);
		}
		return [...names];
	};
</script>

<script lang="ts">
	/**
	 * Like `CmsForm`, but a submission opens `wa.me` with the editor's
	 * message (answers substituted for `{field}` placeholders) addressed to
	 * the editor's number. The answers are also posted in the background, so
	 * the lead is kept even if the visitor never sends the chat.
	 *
	 * The chat opens inside the submit handler, before the post settles: a
	 * popup opened after an `await` loses the click's user activation and is
	 * blocked. `keepalive` lets the post finish if the page goes away. If the
	 * popup is blocked anyway, this tab goes to WhatsApp instead.
	 *
	 * Without JavaScript the form posts normally, so the answers are still
	 * stored and `redirect` applies; `whatsappHref` is there for a
	 * `<noscript>` link.
	 */
	import { setContext, type Snippet } from 'svelte';
	import type { HTMLFormAttributes } from 'svelte/elements';
	import Structured from './cms-structured.svelte';
	import FormControls from './cms-form-controls.svelte';
	import { cmsStore } from './cms-store.svelte.js';
	import { followRedirect, useFormTarget, type FormStatus } from './use-form-target.svelte.js';
	import { cmsWhatsApp, type CmsWhatsAppValue } from '../../core/shapes/whatsapp.js';
	import { fillMessage, whatsappHref } from '../../core/forms/whatsapp.js';

	type Props = Omit<HTMLFormAttributes, 'action' | 'method' | 'children'> & {
		/** The CMS field holding the number and message. */
		name: string;
		scope?: string;
		fallback?: Partial<CmsWhatsAppValue>;
		value?: unknown;
		/** A hosted form's key, to record each submission to. */
		key?: string;
		/** Record to this route or SvelteKit action instead. */
		action?: string;
		/** Where this tab goes once the chat has opened in a new one. */
		redirect?: string;
		children: Snippet<[CmsWhatsAppFormState]>;
	};
	let {
		name,
		scope,
		fallback,
		value,
		key,
		action,
		redirect,
		children: content,
		...rest
	}: Props = $props();

	const target = useFormTarget(() => ({ key, action }));

	let formEl = $state<HTMLFormElement>();
	setContext(FIELD_NAMES, () => (formEl ? fieldNames(formEl) : []));

	let status = $state<FormStatus>('idle');
	let message = $state<string | null>(null);

	const stateFor = (settings: CmsWhatsAppValue): CmsWhatsAppFormState => ({
		get status() {
			return status;
		},
		get message() {
			return message;
		},
		data: null,
		whatsappHref: whatsappHref(settings.number)
	});

	const record = (body: FormData) => {
		if (!target.url) {
			status = 'success';
			return;
		}
		body.delete('_redirect');
		status = 'submitting';
		fetch(target.url, {
			method: 'POST',
			body,
			keepalive: true,
			headers: { accept: 'application/json' }
		})
			.then(async (res) => {
				status = res.ok ? 'success' : 'failure';
				if (!res.ok) message = ((await res.json().catch(() => null))?.message as string) ?? null;
			})
			.catch(() => {
				status = 'error';
			});
	};

	const submit = (event: SubmitEvent, settings: CmsWhatsAppValue) => {
		event.preventDefault();
		if (cmsStore.isEditing) return;
		const form = event.currentTarget as HTMLFormElement;
		const body = new FormData(form, event.submitter);
		const href = whatsappHref(settings.number, fillMessage(settings.message, body));
		message = null;
		record(body);
		if (!href) {
			status = 'error';
			message = 'No WhatsApp number is set.';
			return;
		}
		const chat = window.open(href, '_blank');
		if (!chat) {
			location.assign(href);
			return;
		}
		chat.opener = null;
		if (redirect) void followRedirect(redirect);
	};
</script>

<Structured
	schema={cmsWhatsApp}
	{name}
	{scope}
	{fallback}
	{value}
	view={(settings) => settings}
	editable={() => import('./cms-whatsapp-form-editable.svelte')}
>
	{#snippet children(settings)}
		<form
			{...rest}
			method="POST"
			action={target.url}
			bind:this={formEl}
			onsubmit={(event) => submit(event, settings)}
		>
			<FormControls {redirect} token={target.token} />
			{@render content(stateFor(settings))}
		</form>
	{/snippet}
</Structured>
