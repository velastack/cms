/**
 * The built-in {@link CmsAuthAdapter}: the CMS owns its editors.
 *
 * Self-contained — no external identity provider, no second service — which is
 * what makes a single-tenant mount work out of the box. A host that already has
 * accounts writes its own adapter instead; the router only ever sees this
 * interface.
 */
import type { CmsAuthAdapter, CmsAuthContext, CmsEditor, CmsSessionGrant } from '../types.js';
import type { ScryptParams } from './scrypt.js';
import { createEditorStore, type CmsEditorStore } from './editors.js';

export type LocalEditorsOptions = {
	/** Session lifetime. Defaults to 30 days, matching the cookie's `maxAge`. */
	sessionTtlMs?: number;
	/** Password work factor. Lower it only in tests. */
	scrypt?: ScryptParams;
};

/**
 * The adapter caches one editor store per database. `resolve` runs on every
 * request, and re-preparing a dozen statements each time would be wasteful; the
 * store's own statements are prepared once and reused.
 */
export const localEditors = (options: LocalEditorsOptions = {}): CmsAuthAdapter => {
	const stores = new WeakMap<object, CmsEditorStore>();

	const storeFor = (ctx: CmsAuthContext): CmsEditorStore => {
		const key = ctx.db as unknown as object;
		let store = stores.get(key);
		if (!store) {
			store = createEditorStore(ctx.db, options.scrypt);
			stores.set(key, store);
		}
		return store;
	};

	return {
		async resolve(event, ctx): Promise<CmsEditor | null> {
			const token = event.cookies.get(ctx.cookieName);
			if (!token) return null;
			return storeFor(ctx).resolveSession(token);
		},

		async authorize(user, projectId, ctx): Promise<boolean> {
			return storeFor(ctx).can(user.id, projectId);
		},

		async login(email, password, ctx): Promise<CmsSessionGrant | null> {
			const store = storeFor(ctx);
			const user = await store.verify(email, password);
			if (!user) return null;
			const { token, expiresAt } = store.createSession(user.id, {
				ttlMs: options.sessionTtlMs
			});
			return { user, token, expiresAt };
		},

		async logout(event, ctx): Promise<void> {
			const token = event.cookies.get(ctx.cookieName);
			if (token) storeFor(ctx).destroySession(token);
		}
	};
};
