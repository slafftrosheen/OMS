// src/lib/a11y/use-keyboard-nav.ts
import { onMount, onDestroy } from 'svelte';

export interface KeyboardNavOptions {
	onEnter?: () => void;
	onEscape?: () => void;
	onArrowUp?: () => void;
	onArrowDown?: () => void;
	onArrowLeft?: () => void;
	onArrowRight?: () => void;
	onSpace?: () => void;
	onHome?: () => void;
	onEnd?: () => void;
}

export function useKeyboardNav(element: HTMLElement, options: KeyboardNavOptions) {
	const handleKeyDown = (e: KeyboardEvent) => {
		switch (e.key) {
			case 'Enter':
				if (options.onEnter) {
					e.preventDefault();
					options.onEnter();
				}
				break;

			case 'Escape':
				if (options.onEscape) {
					e.preventDefault();
					options.onEscape();
				}
				break;

			case 'ArrowUp':
				if (options.onArrowUp) {
					e.preventDefault();
					options.onArrowUp();
				}
				break;

			case 'ArrowDown':
				if (options.onArrowDown) {
					e.preventDefault();
					options.onArrowDown();
				}
				break;

			case 'ArrowLeft':
				if (options.onArrowLeft) {
					e.preventDefault();
					options.onArrowLeft();
				}
				break;

			case 'ArrowRight':
				if (options.onArrowRight) {
					e.preventDefault();
					options.onArrowRight();
				}
				break;

			case ' ':
				if (options.onSpace) {
					e.preventDefault();
					options.onSpace();
				}
				break;

			case 'Home':
				if (options.onHome) {
					e.preventDefault();
					options.onHome();
				}
				break;

			case 'End':
				if (options.onEnd) {
					e.preventDefault();
					options.onEnd();
				}
				break;
		}
	};

	onMount(() => {
		element.addEventListener('keydown', handleKeyDown);
	});

	onDestroy(() => {
		element.removeEventListener('keydown', handleKeyDown);
	});
}

// Svelte action for keyboard navigation
export function keyboardNav(node: HTMLElement, options: KeyboardNavOptions) {
	const handleKeyDown = (e: KeyboardEvent) => {
		const handlers: Record<string, (() => void) | undefined> = {
			Enter: options.onEnter,
			Escape: options.onEscape,
			ArrowUp: options.onArrowUp,
			ArrowDown: options.onArrowDown,
			ArrowLeft: options.onArrowLeft,
			ArrowRight: options.onArrowRight,
			' ': options.onSpace,
			Home: options.onHome,
			End: options.onEnd
		};

		const handler = handlers[e.key];
		if (handler) {
			e.preventDefault();
			handler();
		}
	};

	node.addEventListener('keydown', handleKeyDown);

	return {
		destroy() {
			node.removeEventListener('keydown', handleKeyDown);
		}
	};
}
