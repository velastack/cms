/**
 * Stored shape of an image slot. Seeds and fallbacks may pass a bare URL
 * string; it is normalized to `{ url }`. A cleared slot stores `url: null`.
 */
export type CmsImageValue = {
	url?: string | null;
	alt?: string | null;
	width?: number;
	height?: number;
};

export const normalizeImage = (raw: unknown): CmsImageValue => {
	if (raw == null) return {};
	if (typeof raw === 'string') return { url: raw };
	if (typeof raw === 'object' && !Array.isArray(raw)) {
		const r = raw as Record<string, unknown>;
		const out: CmsImageValue = {};
		if (typeof r.url === 'string') out.url = r.url;
		if (typeof r.alt === 'string') out.alt = r.alt;
		if (typeof r.width === 'number') out.width = r.width;
		if (typeof r.height === 'number') out.height = r.height;
		return out;
	}
	return {};
};

/** An image inside a structured value: `null` when there is no URL. */
export const asImage = (raw: unknown): CmsImageValue | null => {
	const img = normalizeImage(raw);
	return img.url ? img : null;
};

/** A list of images, dropping entries without a URL. */
export const asImages = (raw: unknown): CmsImageValue[] =>
	Array.isArray(raw) ? raw.map(asImage).filter((i): i is CmsImageValue => i !== null) : [];
