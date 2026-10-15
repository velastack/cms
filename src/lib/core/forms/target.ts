/**
 * Where a form posts when the template names a hosted form by `key`.
 *
 * velastack.dev serves a project's CMS at `/v1/projects/<id>/cms` and its
 * hosted forms beside it at `/v1/projects/<id>/forms/<key>`, the forms a
 * template's manifest declares. Any other endpoint shape (a same-app
 * `/api/cms`, this package's own `/cms` backend) has no hosted forms, so
 * there is nothing to derive and the template passes `action` instead.
 */
const HOSTED_CMS = /^(.*\/v1\/projects\/[^/?#]+)\/cms\/?$/;

export const hostedFormUrl = (endpoint: string, key: string): string | null => {
	const match = HOSTED_CMS.exec(endpoint);
	return match ? `${match[1]}/forms/${encodeURIComponent(key)}` : null;
};

/** Fields a form carries for the endpoint rather than the submission. */
export const isControlField = (name: string): boolean => name.startsWith('_');
