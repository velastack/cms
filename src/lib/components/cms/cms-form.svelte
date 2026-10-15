<script lang="ts" module>
	import type { FormStatus } from './use-form-target.svelte.js';

	export type { FormStatus as CmsFormStatus };

	/** What `children` gets: how the last submission went. */
	export type CmsFormState = {
		readonly status: FormStatus;
		/** The endpoint's or action's message on `failure` / `error`. */
		readonly message: string | null;
		/** The action's returned data on `success` / `failure`. */
		readonly data: Record<string, unknown> | null;
	};
</script>

<script lang="ts">
	/**
	 * `CmsForm`: a form that posts to a hosted form by `key`, or to the
	 * template's own `action`. The inputs are the template's children.
	 *
	 * It is a real `<form method="POST">`, so it works without JavaScript;
	 * with it, `use:enhance` posts in place and `children` sees the status.
	 * The hosted endpoint answers enhanced posts the way a SvelteKit action
	 * does, so both destinations behave the same. Results are handled here
	 * rather than by the default callback, which would reload the page's data
	 * on success and send a network failure to the error page.
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLFormAttributes } from 'svelte/elements';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { cmsStore } from './cms-store.svelte.js';
	import { followRedirect, useFormTarget } from './use-form-target.svelte.js';
	import FormControls from './cms-form-controls.svelte';

	type Props = Omit<HTMLFormAttributes, 'action' | 'method' | 'children'> & {
		/** A hosted form's key, as the template manifest declares it. */
		key?: string;
		/** Post here instead: a route, or a SvelteKit action like `?/contact`. */
		action?: string;
		/** Where to go after a successful submission. */
		redirect?: string;
		children: Snippet<[CmsFormState]>;
	};
	let { key, action, redirect, children, ...rest }: Props = $props();

	const target = useFormTarget(() => ({ key, action }));

	let status = $state<FormStatus>('idle');
	let message = $state<string | null>(null);
	let data = $state<Record<string, unknown> | null>(null);
	const formState: CmsFormState = {
		get status() {
			return status;
		},
		get message() {
			return message;
		},
		get data() {
			return data;
		}
	};

	const messageOf = (value: unknown): string | null =>
		value && typeof value === 'object' && 'message' in value && typeof value.message === 'string'
			? value.message
			: null;

	const submit: SubmitFunction = ({ cancel }) => {
		// Editors are changing the page, not filling it in.
		if (cmsStore.isEditing) return cancel();
		status = 'submitting';
		message = null;
		data = null;
		return async ({ result, formElement, update }) => {
			if (result.type === 'success') {
				status = 'success';
				data = result.data ?? null;
				formElement.reset();
				if (redirect) await followRedirect(redirect);
			} else if (result.type === 'failure') {
				status = 'failure';
				data = result.data ?? null;
				message = messageOf(result.data);
			} else if (result.type === 'redirect') {
				// A same-app action redirected; let SvelteKit follow it.
				status = 'success';
				await update();
			} else {
				status = 'error';
				message = messageOf(result.error);
			}
		};
	};
</script>

<form {...rest} method="POST" action={target.url} use:enhance={submit}>
	<FormControls {redirect} token={target.token} />
	{@render children(formState)}
</form>
