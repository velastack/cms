/**
 * Where a `CmsForm` or `CmsWhatsAppForm` posts, and the load-time token a
 * hosted form wants with it.
 *
 * `action` wins when given: the template's own route or SvelteKit action.
 * Otherwise `key` names a hosted form beside the CMS endpoint (see
 * `core/forms/target.ts`). The token only exists for hosted forms. It is
 * fetched on mount because the endpoint refuses one younger than two
 * seconds; a post without it is still stored, just as unverified.
 */
import { dev } from '$app/env';
import { goto } from '$app/navigation';
import { cms } from './cms-store.svelte.js';
import { hostedFormUrl } from '../../core/forms/target.js';

export type FormStatus = 'idle' | 'submitting' | 'success' | 'failure' | 'error';

export type FormTargetInput = { key?: string; action?: string };

/**
 * After an enhanced post, go where `_redirect` would have sent a post
 * without JavaScript. The hosted endpoint never answers an enhanced post
 * with a redirect (the client would hand an external URL to `goto`), so the
 * form follows it itself.
 */
export const followRedirect = async (redirect: string): Promise<void> => {
	const url = new URL(redirect, location.href);
	if (url.origin === location.origin) await goto(url.href);
	else location.assign(url.href);
};

export type FormTarget = {
	/** The form's `action`; `undefined` posts back to the page. */
	readonly url: string | undefined;
	readonly token: string | null;
};

export const useFormTarget = (input: () => FormTargetInput): FormTarget => {
	const hosted = $derived.by(() => {
		const { key, action } = input();
		return action === undefined && key ? hostedFormUrl(cms.endpoint, key) : null;
	});
	const url = $derived(input().action ?? hosted ?? undefined);
	let token = $state<string | null>(null);

	$effect(() => {
		const target = hosted;
		token = null;
		if (!target) return;
		let live = true;
		fetch(target, { headers: { accept: 'application/json' } })
			.then((res) => (res.ok ? res.json() : null))
			.then((body) => {
				if (live && typeof body?.token === 'string') token = body.token;
			})
			.catch(() => {});
		return () => {
			live = false;
		};
	});

	$effect(() => {
		if (dev && url === undefined) {
			const { key } = input();
			console.warn(
				key
					? `[cms] Form "${key}" has no hosted endpoint (CMS endpoint "${cms.endpoint}"); pass \`action\`.`
					: '[cms] Form has neither `key` nor `action`; it will post back to the page.'
			);
		}
	});

	return {
		get url() {
			return url;
		},
		get token() {
			return token;
		}
	};
};
