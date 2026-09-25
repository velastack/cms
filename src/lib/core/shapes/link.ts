import { resolveRouteUrl } from '../../components/admin-bar/resolve-route.js';
import { isPlainObject } from '../structured.js';

export type CmsLinkValue = {
	label?: string;
	/** Raw URL — used when `routeId` is absent. */
	href?: string;
	/** SvelteKit route id, e.g. `/blog/[slug]`. Resolved at render time. */
	routeId?: string;
	params?: Record<string, string>;
	newTab?: boolean;
};

export const normalizeLink = (raw: unknown): CmsLinkValue => {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	const r = raw as Record<string, unknown>;
	const out: CmsLinkValue = {};
	if (typeof r.label === 'string') out.label = r.label;
	if (typeof r.href === 'string') out.href = r.href;
	if (typeof r.routeId === 'string') out.routeId = r.routeId;
	if (r.params && typeof r.params === 'object' && !Array.isArray(r.params)) {
		out.params = r.params as Record<string, string>;
	}
	if (typeof r.newTab === 'boolean') out.newTab = r.newTab;
	return out;
};

/** A link inside a structured value: `null` when nothing points anywhere. */
export const asLink = (raw: unknown): CmsLinkValue | null => {
	if (!isPlainObject(raw)) return null;
	const link = normalizeLink(raw);
	return link.href || link.routeId ? link : null;
};

/** The URL a link points at, or `fallback` when it points nowhere or the
 * route cannot be resolved. */
export const linkHref = (link: CmsLinkValue | null | undefined, fallback = ''): string => {
	if (!link) return fallback;
	if (link.routeId) {
		try {
			return resolveRouteUrl(link.routeId, link.params ?? {});
		} catch {
			return fallback;
		}
	}
	return link.href ?? fallback;
};
