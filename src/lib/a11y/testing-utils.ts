// src/lib/a11y/testing-utils.ts
import axe, { type RunOptions, type Result } from 'axe-core';
import { browser } from '$app/environment';

export interface A11yViolation {
	id: string;
	impact: 'minor' | 'moderate' | 'serious' | 'critical';
	description: string;
	help: string;
	helpUrl: string;
	nodes: Array<{
		html: string;
		target: string[];
		failureSummary: string;
	}>;
}

export interface A11yReport {
	violations: A11yViolation[];
	passes: number;
	incomplete: number;
	timestamp: string;
	url: string;
}

class AccessibilityTester {
	private config: RunOptions = {
		runOnly: {
			type: 'tag',
			values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
		},
		rules: {
			// Custom rule configurations
			'color-contrast': { enabled: true },
			'focus-order-semantics': { enabled: true },
			'landmark-one-main': { enabled: true }
		}
	};

	async runTest(element?: Element): Promise<A11yReport> {
		if (!browser) {
			throw new Error('Accessibility tests can only run in browser');
		}

		const target = element || document.body;
		const results = await axe.run(target, this.config);

		return {
			violations: results.violations.map(this.formatViolation),
			passes: results.passes.length,
			incomplete: results.incomplete.length,
			timestamp: new Date().toISOString(),
			url: window.location.href
		};
	}

	private formatViolation(violation: Result): A11yViolation {
		return {
			id: violation.id,
			impact: violation.impact || 'moderate',
			description: violation.description,
			help: violation.help,
			helpUrl: violation.helpUrl,
			nodes: violation.nodes.map((node) => ({
				html: node.html,
				target: node.target as unknown as string[],
				failureSummary: node.failureSummary || ''
			}))
		};
	}

	async testColorContrast(
		foreground: string,
		background: string,
		fontSize: number = 16
	): Promise<{
		ratio: number;
		AA: boolean;
		AAA: boolean;
		largeText: boolean;
	}> {
		const ratio = this.getContrastRatio(foreground, background);
		const isLargeText = fontSize >= 18 || (fontSize >= 14 && true); // bold

		return {
			ratio: Math.round(ratio * 100) / 100,
			AA: isLargeText ? ratio >= 3 : ratio >= 4.5,
			AAA: isLargeText ? ratio >= 4.5 : ratio >= 7,
			largeText: isLargeText
		};
	}

	private getContrastRatio(fg: string, bg: string): number {
		const fgLuminance = this.getLuminance(fg);
		const bgLuminance = this.getLuminance(bg);

		const lighter = Math.max(fgLuminance, bgLuminance);
		const darker = Math.min(fgLuminance, bgLuminance);

		return (lighter + 0.05) / (darker + 0.05);
	}

	private getLuminance(color: string): number {
		const rgb = this.hexToRgb(color);
		const [r, g, b] = rgb.map((val) => {
			const normalized = val / 255;
			return normalized <= 0.03928
				? normalized / 12.92
				: Math.pow((normalized + 0.055) / 1.055, 2.4);
		});

		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	}

	private hexToRgb(hex: string): [number, number, number] {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result
			? [
					parseInt(result[1], 16),
					parseInt(result[2], 16),
					parseInt(result[3], 16)
			  ]
			: [0, 0, 0];
	}

	async validateThemeContrasts(theme: Record<string, string>): Promise<{
		valid: boolean;
		issues: Array<{ pair: string; ratio: number; required: number }>;
	}> {
		const issues: Array<{ pair: string; ratio: number; required: number }> = [];

		// Test common color pairs
		const pairs = [
			{ name: 'text/bg', fg: theme['--text'], bg: theme['--bg-0'], required: 4.5 },
			{ name: 'muted/bg', fg: theme['--muted'], bg: theme['--bg-0'], required: 4.5 },
			{ name: 'accent/bg', fg: theme['--accent-1'], bg: theme['--bg-0'], required: 3 },
			{ name: 'border/bg', fg: theme['--border'], bg: theme['--bg-0'], required: 3 }
		];

		for (const pair of pairs) {
			if (!pair.fg || !pair.bg) continue;

			const result = await this.testColorContrast(pair.fg, pair.bg);
			if (result.ratio < pair.required) {
				issues.push({
					pair: pair.name,
					ratio: result.ratio,
					required: pair.required
				});
			}
		}

		return {
			valid: issues.length === 0,
			issues
		};
	}
}

export const a11yTester = new AccessibilityTester();
