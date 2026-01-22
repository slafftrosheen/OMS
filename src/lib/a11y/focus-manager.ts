// src/lib/a11y/focus-manager.ts
import { browser } from '$app/environment';

export class FocusManager {
	private focusHistory: HTMLElement[] = [];
	private trapStack: Array<{ element: HTMLElement; returnFocus: HTMLElement | null }> = [];

	// Save current focus
	saveFocus(): void {
		if (!browser) return;

		const activeElement = document.activeElement as HTMLElement;
		if (activeElement && activeElement !== document.body) {
			this.focusHistory.push(activeElement);
		}
	}

	// Restore previous focus
	restoreFocus(): void {
		if (!browser || this.focusHistory.length === 0) return;

		const element = this.focusHistory.pop();
		if (element && document.contains(element)) {
			element.focus();
		}
	}

	// Trap focus within an element (for modals, dialogs)
	trapFocus(container: HTMLElement): () => void {
		if (!browser) return () => {};

		const returnFocus = document.activeElement as HTMLElement;
		this.trapStack.push({ element: container, returnFocus });

		// Get focusable elements
		const focusableElements = this.getFocusableElements(container);
		if (focusableElements.length === 0) return () => {};

		const firstElement = focusableElements[0];
		const lastElement = focusableElements[focusableElements.length - 1];

		// Focus first element
		firstElement.focus();

		// Handle tab navigation
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Tab') return;

			if (e.shiftKey) {
				// Shift + Tab
				if (document.activeElement === firstElement) {
					e.preventDefault();
					lastElement.focus();
				}
			} else {
				// Tab
				if (document.activeElement === lastElement) {
					e.preventDefault();
					firstElement.focus();
				}
			}
		};

		container.addEventListener('keydown', handleKeyDown);

		// Return cleanup function
		return () => {
			container.removeEventListener('keydown', handleKeyDown);
			this.releaseFocusTrap();
		};
	}

	// Release focus trap
	releaseFocusTrap(): void {
		if (!browser || this.trapStack.length === 0) return;

		const { returnFocus } = this.trapStack.pop()!;
		if (returnFocus && document.contains(returnFocus)) {
			returnFocus.focus();
		}
	}

	// Get all focusable elements within a container
	getFocusableElements(container: HTMLElement): HTMLElement[] {
		const selector = [
			'a[href]',
			'button:not([disabled])',
			'textarea:not([disabled])',
			'input:not([disabled])',
			'select:not([disabled])',
			'[tabindex]:not([tabindex="-1"])'
		].join(', ');

		return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
			(el) => !el.hasAttribute('disabled') && this.isVisible(el)
		);
	}

	// Check if element is visible
	private isVisible(element: HTMLElement): boolean {
		const style = window.getComputedStyle(element);
		return (
			style.display !== 'none' &&
			style.visibility !== 'hidden' &&
			style.opacity !== '0'
		);
	}

	// Focus first error in form
	focusFirstError(container: HTMLElement): void {
		if (!browser) return;

		const errorElement = container.querySelector('[aria-invalid="true"]') as HTMLElement;
		if (errorElement) {
			errorElement.focus();
			errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	// Announce message to screen readers
	announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
		if (!browser) return;

		let liveRegion = document.getElementById('a11y-live-region');
		
		if (!liveRegion) {
			liveRegion = document.createElement('div');
			liveRegion.id = 'a11y-live-region';
			liveRegion.setAttribute('role', 'status');
			liveRegion.setAttribute('aria-live', priority);
			liveRegion.setAttribute('aria-atomic', 'true');
			liveRegion.className = 'sr-only';
			document.body.appendChild(liveRegion);
		}

		// Clear and set message
		liveRegion.textContent = '';
		setTimeout(() => {
			liveRegion!.textContent = message;
		}, 100);
	}
}

export const focusManager = new FocusManager();
