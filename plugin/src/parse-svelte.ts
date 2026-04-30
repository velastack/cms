import { readFileSync } from 'node:fs';
import { parse } from 'svelte/compiler';

export type ParsedImport = {
	source: string;
	bindings: Array<{ imported: string; local: string }>;
};

export type ComponentUsage = {
	/** Local binding name as used in the template, e.g. `CmsText` or `Title`. */
	componentName: string;
	/** Static value of the `name=` prop, or `null` if absent / non-static. */
	fieldName: string | null;
	/** Whether a `value=` prop was present (marks per-item overrides). */
	hasValueAttr: boolean;
	/** Static value of the `routeId=` prop, or `null` if absent / non-static. */
	routeIdAttr: string | null;
};

export type InstanceScriptRange = {
	/** Source offset where the inner script content begins (just after `<script ...>`). */
	contentStart: number;
	/** Source offset where the inner script content ends (just before `</script>`). */
	contentEnd: number;
};

export type ParsedSvelte = {
	/** Static imports declared in `<script>` / `<script context="module">`. */
	imports: ParsedImport[];
	/** Every `<Component>` usage in the template (CMS or otherwise). */
	componentUsages: ComponentUsage[];
	/** Position of the instance `<script>` block, or `null` if absent. */
	instanceScript: InstanceScriptRange | null;
	/** Source length, so callers don't have to keep the raw text around. */
	sourceLength: number;
};

const isStringLiteralNode = (node: unknown): node is { value: string } => {
	if (!node || typeof node !== 'object') return false;
	const n = node as { type?: string; value?: unknown };
	return (n.type === 'Literal' || n.type === 'StringLiteral') && typeof n.value === 'string';
};

const staticAttributeValue = (attrValue: unknown): string | null => {
	if (attrValue === true) return null;
	if (!Array.isArray(attrValue) || attrValue.length === 0) return null;
	if (attrValue.length === 1) {
		const only = attrValue[0] as { type?: string; data?: string; expression?: unknown };
		if (only.type === 'Text' && typeof only.data === 'string') return only.data;
		if (only.type === 'ExpressionTag' && isStringLiteralNode(only.expression)) {
			return (only.expression as { value: string }).value;
		}
	}
	const chunks: string[] = [];
	for (const part of attrValue) {
		const p = part as { type?: string; data?: string };
		if (p.type !== 'Text' || typeof p.data !== 'string') return null;
		chunks.push(p.data);
	}
	return chunks.join('');
};

const visit = (node: unknown, fn: (n: { type: string } & Record<string, unknown>) => void) => {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) visit(child, fn);
		return;
	}
	const n = node as Record<string, unknown> & { type?: string };
	if (typeof n.type === 'string') fn(n as { type: string } & Record<string, unknown>);
	for (const key of [
		'fragment',
		'nodes',
		'children',
		'attributes',
		'consequent',
		'alternate',
		'pending',
		'then',
		'catch',
		'body'
	]) {
		const child = n[key];
		if (child) visit(child, fn);
	}
};

export const parseSvelteSource = (code: string, filename?: string): ParsedSvelte => {
	const ast = parse(code, { filename, modern: true }) as unknown as {
		instance?: { content: { start: number; end: number; body: unknown[] } };
		module?: { content: { body: unknown[] } };
		fragment: unknown;
	};

	const imports: ParsedImport[] = [];
	for (const block of [ast.module, ast.instance]) {
		if (!block) continue;
		for (const raw of block.content.body) {
			const stmt = raw as {
				type?: string;
				source?: { value?: unknown };
				specifiers?: Array<{ type: string; imported?: { name: string }; local: { name: string } }>;
			};
			if (stmt.type !== 'ImportDeclaration' || typeof stmt.source?.value !== 'string') continue;
			const bindings: ParsedImport['bindings'] = [];
			for (const spec of stmt.specifiers ?? []) {
				if (spec.type === 'ImportDefaultSpecifier') {
					bindings.push({ imported: 'default', local: spec.local.name });
				} else if (spec.type === 'ImportSpecifier' && spec.imported) {
					bindings.push({ imported: spec.imported.name, local: spec.local.name });
				}
			}
			imports.push({ source: stmt.source.value, bindings });
		}
	}

	const componentUsages: ComponentUsage[] = [];
	visit(ast.fragment, (node) => {
		if (node.type !== 'Component') return;
		const componentName = node.name as string | undefined;
		if (!componentName) return;
		const attrs = (node.attributes as unknown[]) ?? [];
		const nameAttr = attrs.find((a) => {
			const attr = a as { type?: string; name?: string };
			return attr.type === 'Attribute' && attr.name === 'name';
		}) as { value?: unknown } | undefined;
		const hasValueAttr = attrs.some((a) => {
			const attr = a as { type?: string; name?: string };
			return attr.type === 'Attribute' && attr.name === 'value';
		});
		const routeIdAttr = attrs.find((a) => {
			const attr = a as { type?: string; name?: string };
			return attr.type === 'Attribute' && attr.name === 'routeId';
		}) as { value?: unknown } | undefined;
		componentUsages.push({
			componentName,
			fieldName: nameAttr ? staticAttributeValue(nameAttr.value) : null,
			hasValueAttr,
			routeIdAttr: routeIdAttr ? staticAttributeValue(routeIdAttr.value) : null
		});
	});

	const instanceScript: InstanceScriptRange | null = ast.instance
		? {
				contentStart: ast.instance.content.start,
				contentEnd: ast.instance.content.end
			}
		: null;

	return { imports, componentUsages, instanceScript, sourceLength: code.length };
};

export const parseSvelteFile = (filePath: string): ParsedSvelte => {
	const code = readFileSync(filePath, 'utf-8');
	return parseSvelteSource(code, filePath);
};
