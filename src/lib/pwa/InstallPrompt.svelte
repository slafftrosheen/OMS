<!-- src/lib/pwa/InstallPrompt.svelte -->
<script lang="ts">
	import { installPrompt, isInstalled } from '$lib/pwa/pwa-service';
	import { pwaService } from '$lib/pwa/pwa-service';
	import { Download, X } from 'lucide-svelte';
	import { fly } from 'svelte/transition';

	let showPrompt = false;
	let installing = false;

	// Show prompt after a delay
	$: if ($installPrompt && !$isInstalled) {
		setTimeout(() => {
			showPrompt = true;
		}, 5000); // Show after 5 seconds
	}

	async function handleInstall() {
		installing = true;
		const success = await pwaService.install();
		installing = false;
		if (success) {
			showPrompt = false;
		}
	}

	function handleDismiss() {
		showPrompt = false;
		// Remember dismissal (don't show again for 7 days)
		localStorage.setItem('pwa-prompt-dismissed', Date.now().toString());
	}
</script>

{#if showPrompt && !$isInstalled}
	<div class="install-prompt" transition:fly={{ y: 100, duration: 300 }}>
		<div class="prompt-icon">
			<Download size={24} />
		</div>
		<div class="prompt-content">
			<h3>Install OMS App</h3>
			<p>Get quick access from your home screen. Works offline!</p>
		</div>
		<div class="prompt-actions">
			<button
				class="btn btn-primary"
				on:click={handleInstall}
				disabled={installing}
			>
				{installing ? 'Installing...' : 'Install'}
			</button>
			<button
				class="btn btn-ghost"
				on:click={handleDismiss}
				aria-label="Dismiss"
			>
				<X size={20} />
			</button>
		</div>
	</div>
{/if}

<style>
	.install-prompt {
		position: fixed;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 9998;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.5rem;
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
		max-width: 500px;
		width: calc(100% - 2rem);
	}

	.prompt-icon {
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--accent-1);
		color: white;
		border-radius: 12px;
	}

	.prompt-content {
		flex: 1;
	}

	.prompt-content h3 {
		margin: 0 0 0.25rem 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.prompt-content p {
		margin: 0;
		font-size: 0.875rem;
		color: var(--muted);
	}

	.prompt-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn {
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-primary {
		background: var(--accent-1);
		color: white;
		border: none;
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--accent-2);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-ghost {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--muted);
	}

	.btn-ghost:hover {
		background: var(--bg-2);
		color: var(--text);
	}

	 @media (max-width: 768px) {
		.install-prompt {
			bottom: 0;
			left: 0;
			right: 0;
			transform: none;
			border-radius: 12px 12px 0 0;
			max-width: none;
			width: 100%;
		}
	}
</style>
