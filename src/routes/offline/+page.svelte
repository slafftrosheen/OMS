<!-- src/routes/offline/+page.svelte -->
<script>
	import Icon from '$lib/ui/Icon.svelte';

	function handleRetry() {
		window.location.reload();
	}
</script>

<svelte:head>
	<title>Offline - OMS</title>
</svelte:head>

<div class="offline-page">
	<div class="offline-content">
		<div class="offline-icon">
			<WifiOff size={64} />
		</div>
		
		<h1>You're Offline</h1>
		<p>
			No internet connection detected. Some features may be limited while offline.
		</p>

		<div class="offline-actions">
			<button class="btn-retry" onclick={handleRetry}>
				<RefreshCw size={20} />
				Try Again
			</button>
		</div>

		<div class="offline-info">
			<h2>What you can do offline:</h2>
			<ul>
				<li>View recently accessed orders</li>
				<li>Browse cached inventory data</li>
				<li>View loading calendar (cached)</li>
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
		padding: 2rem;
		background: var(--bg-0);
	}

	.offline-content {
		max-width: 500px;
		text-align: center;
	}

	.offline-icon {
		display: inline-flex;
		padding: 2rem;
		background: var(--bg-1);
		border-radius: 50%;
		color: var(--muted);
		margin-bottom: 2rem;
	}

	h1 {
		margin: 0 0 1rem 0;
		font-size: 2rem;
	}

	p {
		color: var(--muted);
		margin: 0 0 2rem 0;
	}

	.btn-retry {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: var(--accent-1);
		color: var(--bg-0);
		border: none;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}

	.btn-retry:hover {
		background: var(--accent-2);
	}

	.offline-info {
		margin-top: 3rem;
		padding: 1.5rem;
		background: var(--bg-1);
		border-radius: 8px;
		text-align: left;
	}

	.offline-info h2 {
		margin: 0 0 1rem 0;
		font-size: 1.125rem;
	}

	.offline-info ul {
		margin: 0;
		padding-left: 1.5rem;
	}

	.offline-info li {
		margin-bottom: 0.5rem;
		color: var(--muted);
	}
</style>
