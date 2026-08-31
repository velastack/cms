/**
 * Minimal stand-in for `tailwind-variants`.
 *
 * The bar only ever uses the flat case: a `base` string, one or more variant
 * groups whose values are class strings, and `defaultVariants`. No slots, no
 * compound variants, no responsive variants — so the real package isn't worth
 * a runtime dependency for two components.
 */
type VariantGroups = Record<string, Record<string, string>>;

type Selection<V extends VariantGroups> = { [K in keyof V]?: keyof V[K] };

/** Infers the accepted variant props from a `variants()` result. */
export type VariantProps<F> = F extends (props?: infer P) => string ? NonNullable<P> : never;

export const variants =
	<V extends VariantGroups>(config: {
		base?: string;
		variants: V;
		defaultVariants?: Selection<V>;
	}) =>
	(props: Selection<V> = {}): string => {
		const out: string[] = [];
		if (config.base) out.push(config.base);
		for (const group of Object.keys(config.variants) as (keyof V)[]) {
			const key = props[group] ?? config.defaultVariants?.[group];
			if (key == null) continue;
			const cls = config.variants[group][key as string];
			if (cls) out.push(cls);
		}
		return out.join(' ');
	};
