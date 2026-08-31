import type { WithElementRef as BitsWithElementRef } from 'bits-ui';
import { extendTailwindMerge } from 'tailwind-merge';

export type ClassValue =
	string | number | bigint | null | undefined | boolean | ClassValue[] | { [key: string]: unknown };

/**
 * Joins class values the way `clsx` does — strings and numbers pass through,
 * arrays flatten, and object keys are emitted for truthy values.
 *
 * Vendored (a port of clsx, MIT, Copyright (c) Luke Edwards) rather than
 * depended on: it's ~20 lines, and the bar is the only consumer.
 */
const toValue = (mix: ClassValue): string => {
	if (typeof mix === 'string' || typeof mix === 'number' || typeof mix === 'bigint') {
		return String(mix);
	}
	if (typeof mix !== 'object' || mix === null) return '';

	let str = '';
	if (Array.isArray(mix)) {
		for (const item of mix) {
			if (!item) continue;
			const next = toValue(item);
			if (next) str += (str && ' ') + next;
		}
		return str;
	}
	for (const key in mix) {
		if (mix[key]) str += (str && ' ') + key;
	}
	return str;
};

export const clsx = (...inputs: ClassValue[]): string => {
	let str = '';
	for (const input of inputs) {
		if (!input) continue;
		const next = toValue(input);
		if (next) str += (str && ' ') + next;
	}
	return str;
};

const twMerge = extendTailwindMerge({ prefix: 'vela' });

export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(...inputs));
}

export type WithElementRef<T, U extends HTMLElement = HTMLElement> = BitsWithElementRef<T, U>;
export type WithoutChild<T> = Omit<T, 'child'>;
export type WithoutChildren<T> = Omit<T, 'children'>;
export type WithoutChildrenOrChild<T> = Omit<T, 'children' | 'child'>;
