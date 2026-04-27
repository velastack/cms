export type CmsNewPageField =
	| string
	| { name: string; label?: string; placeholder?: string };

export type CmsNewPageConfig = {
	type: string;
	routeId: string;
	fields: CmsNewPageField[];
	transform: (data: Record<string, string>) => {
		params: Record<string, string>;
		metadata?: Record<string, unknown>;
	};
};

export type NormalizedField = { name: string; label: string; placeholder: string };

export const normalizeField = (f: CmsNewPageField): NormalizedField =>
	typeof f === 'string'
		? { name: f, label: f, placeholder: '' }
		: { label: f.name, placeholder: '', ...f };

export const defineNewPages = <const T extends CmsNewPageConfig[]>(c: T): T => c;
