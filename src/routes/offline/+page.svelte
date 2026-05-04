<!-- src/routes/offline/+page.svelte -->
<script>
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import WifiOff from 'lucide-svelte/icons/wifi-off';
  import { t } from 'svelte-i18n';

	function handleRetry() {
		window.location.reload();
	}
</script>

<svelte:head>
	<title>{$t('offline.title')} - OMS</title>
</svelte:head>

<div class="offline-page">
	<div class="offline-content">
		<div class="offline-icon">
			<WifiOff size={64} />
		</div>

		<h1>{$t('offline.title')}</h1>
		<p>{$t('offline.description')}</p>

		<div class="offline-actions">
			<button class="btn-retry" onclick={handleRetry}>
				<RefreshCw size={20} />
				{$t('offline.retry')}
			</button>
		</div>

		<div class="offline-info">
			<h2>{$t('offline.what_can_do')}</h2>
			<ul>
				<li>{$t('offline.recent_orders')}</li>
				<li>{$t('offline.cached_inventory')}</li>
				<li>{$t('offline.cached_calendar')}</li>
			</ul>
		</div>
	</div>
</div>

<style>
	.offline-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-xl);
		background: var(--bg-0);
	}

	.offline-content {
		max-width: 500px;
		text-align: center;
	}

	.offline-icon {
		display: inline-flex;
		padding: var(--space-xl);
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		border: 1px solid var(--glass-border);
		border-radius: var(--radius-full);
		color: var(--muted);
		margin-bottom: var(--space-xl);
	}

	h1 {
		margin: 0 0 var(--space-md) 0;
		font-size: var(--text-3xl);
	}

	p {
		color: var(--muted);
		margin: 0 0 var(--space-xl) 0;
		font-size: var(--text-md);
		line-height: 1.6;
	}

	.offline-actions {
		margin-bottom: var(--space-xl);
	}

	.btn-retry {
		display: inline-flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-lg);
		background: var(--brand);
		color: var(--bg-0);
		border: none;
		border-radius: var(--radius-full);
		font-weight: 600;
		font-size: var(--text-md);
		cursor: pointer;
		transition: opacity var(--transition-fast);
	}

	.btn-retry:hover { opacity: 0.85; }
	.btn-retry:focus-visible { box-shadow: var(--focus-ring); outline: none; }

	.offline-info {
		margin-top: var(--space-2xl);
		padding: var(--space-lg);
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		border: 1px solid var(--glass-border);
		border-radius: var(--radius-lg);
		text-align: left;
	}

	.offline-info h2 {
		margin: 0 0 var(--space-md) 0;
		font-size: var(--text-lg);
		font-weight: 600;
	}

	.offline-info ul {
		margin: 0;
		padding-left: var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.offline-info li {
		color: var(--muted);
		font-size: var(--text-md);
	}
</style>
