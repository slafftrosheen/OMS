<!-- src/lib/a11y/ContrastChecker.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { a11yTester } from '$lib/a11y/testing-utils';
	import { AlertCircle, CheckCircle, Info } from 'lucide-svelte';

	interface Props {
		theme?: 'light' | 'dark' | 'high-contrast';
	}

	let { theme = 'light' }: Props = $props();

	let results: Array<{
		pair: string;
		foreground: string;
		background: string;
		ratio: number;
		AA: boolean;
		AAA: boolean;
		status: 'pass' | 'warn' | 'fail';
	}> = $state([]);

	const themeColors: Record<string, Record<string, string>> = {
		light: {
			'--text': '#1e2327',
			'--bg-0': '#ffffff',
			'--muted': '#6b7280',
			'--border': '#e5e7eb',
			'--accent-1': '#6366f1'
		},
		dark: {
			'--text': '#f9fafb',
			'--bg-0': '#1e2327',
			'--muted': '#9ca3af',
			'--border': '#374151',
			'--accent-1': '#818cf8'
		},
		'high-contrast': {
			'--text': '#000000',
			'--bg-0': '#ffffff',
			'--muted': '#333333',
			'--border': '#000000',
			'--accent-1': '#0000ff'
		}
	};

	onMount(async () => {
		await checkContrasts();
	});

	async function checkContrasts() {
		const colors = themeColors[theme];
		const pairs = [
			{ name: 'Body text', fg: '--text', bg: '--bg-0', minRatio: 4.5 },
			{ name: 'Muted text', fg: '--muted', bg: '--bg-0', minRatio: 4.5 },
			{ name: 'Accent text', fg: '--accent-1', bg: '--bg-0', minRatio: 3 },
			{ name: 'Border', fg: '--border', bg: '--bg-0', minRatio: 3 }
		];

		results = await Promise.all(
			pairs.map(async (pair) => {
				const fg = colors[pair.fg];
				const bg = colors[pair.bg];
				const result = await a11yTester.testColorContrast(fg, bg);

				return {
					pair: pair.name,
					foreground: fg,
					background: bg,
					ratio: result.ratio,
					AA: result.AA,
					AAA: result.AAA,
					status: result.ratio >= pair.minRatio ? 'pass' : result.ratio >= pair.minRatio * 0.9 ? 'warn' : 'fail'
				};
			})
		);
	}

	function getStatusIcon(status: string) {
		switch (status) {
			case 'pass': return CheckCircle;
			case 'warn': return AlertCircle;
			case 'fail': return AlertCircle;
			default: return Info;
		}
	}
</script>

<div class="contrast-checker">
	<h3>Color Contrast - {theme} theme</h3>

	<div class="results">
		{#each results as result}
			{@const SvelteComponent = getStatusIcon(result.status)}
			<div class="result-item result-{result.status}">
				<div class="result-icon">
					<SvelteComponent size={20} />
				</div>

				<div class="result-info">
					<p class="result-name">{result.pair}</p>
					<div class="result-colors">
						<span class="color-chip" style="background: {result.foreground}"></span>
						<span class="vs">on</span>
						<span class="color-chip" style="background: {result.background}"></span>
					</div>
				</div>

				<div class="result-ratio">
					<p class="ratio-value">{result.ratio.toFixed(2)}:1</p>
					<div class="compliance-badges">
						<span class="badge" class:pass={result.AA}>AA</span>
						<span class="badge" class:pass={result.AAA}>AAA</span>
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.contrast-checker {
		padding: 1.5rem;
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: 8px;
	}

	h3 {
		margin: 0 0 1rem 0;
		font-size: 1.125rem;
	}

	.results {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.result-item {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: var(--bg-0);
		border: 1px solid var(--border);
		border-radius: 6px;
	}

	.result-pass {
		border-left: 3px solid #10b981;
	}

	.result-warn {
		border-left: 3px solid #f59e0b;
	}

	.result-fail {
		border-left: 3px solid #ef4444;
	}

	.result-icon {
		flex-shrink: 0;
	}

	.result-pass .result-icon {
		color: #10b981;
	}

	.result-warn .result-icon {
		color: #f59e0b;
	}

	.result-fail .result-icon {
		color: #ef4444;
	}

	.result-info {
		flex: 1;
	}

	.result-name {
		margin: 0 0 0.5rem 0;
		font-weight: 500;
	}

	.result-colors {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.color-chip {
		width: 24px;
		height: 24px;
		border-radius: 4px;
		border: 1px solid var(--border);
	}

	.vs {
		font-size: 0.75rem;
		color: var(--muted);
	}

	.result-ratio {
		text-align: right;
	}

	.ratio-value {
		margin: 0 0 0.5rem 0;
		font-weight: 600;
		font-size: 1.125rem;
	}

	.compliance-badges {
		display: flex;
		gap: 0.25rem;
	}

	.badge {
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		background: var(--bg-2);
		color: var(--muted);
	}

	.badge.pass {
		background: #10b981;
		color: white;
	}
</style>
