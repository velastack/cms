/**
 * The route table.
 *
 * `auth` semantics:
 * - `public`   anonymous callers are served published content
 * - `required` no editor is a 403
 * - `exempt`   skips the cross-project check, so an editor holding a session for
 *              one project can still reach another's login form and log out
 */
import type { Route } from '../router.js';
import { getDocs } from './docs.js';
import { getSite } from './site.js';
import { deletePages, getPages, postPages, postPagesRename } from './pages.js';
import { getUser, postLogout } from './user.js';
import { getLogin, getLoginSuccess, postLogin } from './login.js';
import {
	deleteReleaseItems,
	getRelease,
	getReleaseHistory,
	postReleaseDiscard,
	postReleaseHistoryPreviewKey,
	postReleaseItems,
	postReleasePreviewKey,
	postReleasePublish,
	postReleaseRevert
} from './release.js';
import { deleteMediaItem, getMedia, getUpload, postMedia } from './media.js';
import { postTestReset } from './test-reset.js';

export const ROUTES: Route[] = [
	{ method: 'GET', segments: ['docs'], auth: 'public', handler: getDocs },
	{ method: 'GET', segments: ['site'], auth: 'public', handler: getSite },

	{ method: 'GET', segments: ['pages'], auth: 'public', handler: getPages },
	{ method: 'POST', segments: ['pages'], auth: 'required', handler: postPages },
	{ method: 'DELETE', segments: ['pages'], auth: 'required', handler: deletePages },
	{ method: 'POST', segments: ['pages', 'rename'], auth: 'required', handler: postPagesRename },

	{ method: 'GET', segments: ['user'], auth: 'required', handler: getUser },
	{ method: 'POST', segments: ['logout'], auth: 'exempt', handler: postLogout },

	{ method: 'GET', segments: ['iframe', 'login'], auth: 'exempt', handler: getLogin },
	{ method: 'POST', segments: ['iframe', 'login'], auth: 'exempt', handler: postLogin },
	{
		method: 'GET',
		segments: ['iframe', 'login', 'success'],
		auth: 'exempt',
		handler: getLoginSuccess
	},

	{ method: 'GET', segments: ['release'], auth: 'required', handler: getRelease },
	{ method: 'POST', segments: ['release', 'items'], auth: 'required', handler: postReleaseItems },
	{
		method: 'DELETE',
		segments: ['release', 'items'],
		auth: 'required',
		handler: deleteReleaseItems
	},
	{
		method: 'POST',
		segments: ['release', 'publish'],
		auth: 'required',
		handler: postReleasePublish
	},
	{
		method: 'POST',
		segments: ['release', 'discard'],
		auth: 'required',
		handler: postReleaseDiscard
	},
	{
		method: 'POST',
		segments: ['release', 'preview-key'],
		auth: 'required',
		handler: postReleasePreviewKey
	},
	{ method: 'GET', segments: ['release', 'history'], auth: 'required', handler: getReleaseHistory },
	{
		method: 'POST',
		segments: ['release', 'history', ':id', 'revert'],
		auth: 'required',
		handler: postReleaseRevert
	},
	{
		method: 'POST',
		segments: ['release', 'history', ':id', 'preview-key'],
		auth: 'required',
		handler: postReleaseHistoryPreviewKey
	},

	{ method: 'GET', segments: ['media'], auth: 'required', handler: getMedia },
	{ method: 'POST', segments: ['media'], auth: 'required', handler: postMedia },
	{ method: 'DELETE', segments: ['media', ':id'], auth: 'required', handler: deleteMediaItem },

	// Served from the mount as well as (optionally) the origin root, so a
	// single-tenant app needs only one mount to be self-contained.
	{ method: 'GET', segments: ['uploads', ':filename'], auth: 'public', handler: getUpload },

	{ method: 'POST', segments: ['__test_reset__'], auth: 'public', handler: postTestReset }
];
