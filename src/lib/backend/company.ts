/**
 * The managed company profile: a host that owns a project's company (see
 * `CmsBackendOptions.company`) has it laid over the site tree on every read
 * and kept out of every write.
 */
import { createHash } from 'node:crypto';
import type { Tree } from '../core/path.js';
import { cmsCompany } from '../core/shapes/company.js';
import type { RouteCtx } from './routes/context.js';
import type { CmsManagedCompany } from './types.js';

/** Reserved site-tree key: who manages what. Never stored. */
const MANAGED_KEY = '$managed';

/** The host's company for this request's project, or `null` when the CMS owns it. */
export const resolveManagedCompany = async (ctx: RouteCtx): Promise<CmsManagedCompany | null> =>
	(await ctx.company?.resolve(ctx.projectId, ctx.event)) ?? null;

/** A site tree as a managed project reads it: the host's company and the marker. */
export const withManagedCompany = (site: Tree, managed: CmsManagedCompany): Tree => ({
	...site,
	company: cmsCompany.normalize(managed.value),
	[MANAGED_KEY]: {
		company: managed.url ? { by: managed.by, url: managed.url } : { by: managed.by }
	}
});

/** A site tree as it may be stored: no marker, and no company when the host manages it. */
export const storableSite = (site: Tree, managed: boolean): Tree => {
	const { [MANAGED_KEY]: _marker, ...rest } = site;
	if (managed) delete rest.company;
	return rest;
};

/** Changes whenever the host's company does; part of the public `/site` validator. */
export const managedCompanyTag = (managed: CmsManagedCompany): string =>
	createHash('sha1').update(JSON.stringify(managed)).digest('base64url').slice(0, 16);
