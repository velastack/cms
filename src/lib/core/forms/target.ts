/**
 * Where a form posts when the template names a hosted form by `key`:
 * velastack.dev serves a project's hosted forms beside its CMS, at
 * `/v1/projects/<id>/forms/<key>`. Any other endpoint shape has no hosted
 * forms, so `hostedFormUrl` gives `null` and the template passes `action`.
 */
export { hostedFormUrl } from '@velastack/whatsapp';

/** Fields a form carries for the endpoint rather than the submission. */
export const isControlField = (name: string): boolean => name.startsWith('_');
