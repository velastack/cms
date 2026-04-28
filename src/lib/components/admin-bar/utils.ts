import { clsx, type ClassValue } from 'clsx';
import type { WithElementRef as BitsWithElementRef } from 'bits-ui';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({ prefix: 'vela' });

export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}

export type WithElementRef<T, U extends HTMLElement = HTMLElement> = BitsWithElementRef<T, U>;
export type WithoutChild<T> = Omit<T, 'child'>;
export type WithoutChildren<T> = Omit<T, 'children'>;
export type WithoutChildrenOrChild<T> = Omit<T, 'children' | 'child'>;
