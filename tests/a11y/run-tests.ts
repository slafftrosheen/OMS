// tests/a11y/run-tests.ts
import { chromium, type Browser, type Page } from '@playwright/test';
import axe from 'axe-core';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface PageTest {
	url: string;
	name: string;
	waitFor?: string;
}

const pagesToTest: PageTest[] = [
	{ url: '/', name: 'Home' },
	{ url: '/login', name: 'Login' },
	{ url: '/orders', name: 'Orders List', waitFor: 'h1' },
	{ url: '/orders/new', name: 'New Order' },
	{ url: '/inventory', name: 'Inventory' },
	{ url: '/calendar', name: 'Calendar' },
	{ url: '/settings', name: 'Settings' }
];

async function runA11yTests() {
	console.log('🔍 Starting accessibility tests...\n');

	const browser: Browser = await chromium.launch();
	const page: Page = await browser.newPage();

	const results: any[] = [];

	for (const pageTest of pagesToTest) {
		console.log(`Testing: ${pageTest.name} (${pageTest.url})`);

		try {
			await page.goto(`http://localhost:4173${pageTest.url}`);
			
			if (pageTest.waitFor) {
				await page.waitForSelector(pageTest.waitFor);
			}

			// Inject axe-core
			await page.addScriptTag({
				url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.0/axe.min.js'
			});

			// Run axe tests
			const axeResults = await page.evaluate(async () => {
				// @ts-ignore
				return await window.axe.run(document, {
					runOnly: {
						type: 'tag',
						values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
					}
				});
			});

			const violations = axeResults.violations.map((v: any) => ({
				id: v.id,
				impact: v.impact,
				description: v.description,
				help: v.help,
				helpUrl: v.helpUrl,
				nodes: v.nodes.length
			}));

			results.push({
				page: pageTest.name,
				url: pageTest.url,
				violations,
				passes: axeResults.passes.length,
				incomplete: axeResults.incomplete.length
			});

			const criticalCount = violations.filter((v: any) => v.impact === 'critical').length;
			const seriousCount = violations.filter((v: any) => v.impact === 'serious').length;

			if (violations.length === 0) {
				console.log(`  ✅ No violations found`);
			} else {
				console.log(`  ⚠️  ${violations.length} violations found`);
				if (criticalCount > 0) console.log(`     🔴 ${criticalCount} critical`);
				if (seriousCount > 0) console.log(`     🟠 ${seriousCount} serious`);
			}

		} catch (error) {
			console.error(`  ❌ Error testing ${pageTest.name}:`, error);
			results.push({
				page: pageTest.name,
				url: pageTest.url,
				error: (error as Error).message
			});
		}

		console.log('');
	}

	await browser.close();

	// Save results
	try {
        mkdirSync('test-results', { recursive: true });
        writeFileSync(
            join('test-results', 'a11y-report.json'),
            JSON.stringify(results, null, 2)
        );
    } catch (e) {
        console.error('Error saving report:', e);
    }

	// Generate summary
	const totalViolations = results.reduce((sum, r) => sum + (r.violations?.length || 0), 0);
	const criticalViolations = results.reduce(
		(sum, r) => sum + (r.violations?.filter((v: any) => v.impact === 'critical').length || 0),
		0
	);

	console.log('📊 Summary:');
	console.log(`   Pages tested: ${results.length}`);
	console.log(`   Total violations: ${totalViolations}`);
	console.log(`   Critical violations: ${criticalViolations}`);
	console.log(`\n📄 Full report saved to: test-results/a11y-report.json`);

	// Exit with error if critical violations found
	if (criticalViolations > 0) {
		process.exit(1);
	}
}

runA11yTests().catch((error) => {
	console.error('Test suite failed:', error);
	process.exit(1);
});
