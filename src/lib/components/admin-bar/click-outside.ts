/**
 * Svelte action: invoke `onOutside` whenever a pointerdown lands outside
 * `node`. Capture-phase listener so a sibling stop-propagation can't suppress
 * dismissal of the bound element.
 */
export const clickOutside = (node: HTMLElement, onOutside: () => void) => {
	const handle = (event: PointerEvent) => {
		if (!node.contains(event.target as Node)) onOutside();
	};
	document.addEventListener('pointerdown', handle, true);
	return {
		destroy() {
			document.removeEventListener('pointerdown', handle, true);
		}
	};
};
