<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import {
		Bot, Send, ExternalLink, ClipboardList, Paintbrush,
		BarChart3, Cpu, Loader2, Trash2, RotateCcw, Sparkles
	} from 'lucide-svelte';

	// ───── Types ─────────────────────────────────────────────────────────
	interface ChatMessage {
		role: 'user' | 'assistant';
		content: string;
		timestamp: Date;
	}

	// ───── State (Svelte 5 runes) ────────────────────────────────────────
	let chatHistory: ChatMessage[] = $state([]);
	let inputValue: string = $state('');
	let isTyping: boolean = $state(false);
	let chatContainer: HTMLElement | undefined = $state(undefined);
	let inputEl: HTMLTextAreaElement | undefined = $state(undefined);
	let errorMsg: string = $state('');

	// ───── Derived ───────────────────────────────────────────────────────
	let hasMessages = $derived(chatHistory.length > 0);

	// ───── Scroll behaviour ──────────────────────────────────────────────
	$effect(() => {
		// Re-run whenever chatHistory length changes or isTyping changes.
		if (chatHistory.length || isTyping) {
			scrollToBottom();
		}
	});

	function scrollToBottom() {
		requestAnimationFrame(() => {
			if (chatContainer) {
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}
		});
	}

	// ───── Quick actions ────────────────────────────────────────────────
	const quickActions = [
		{ label: 'Analyze Orders', icon: BarChart3, prompt: 'Analyze the current order pipeline and identify bottlenecks or at-risk deadlines.' },
		{ label: 'Refactor UI', icon: Paintbrush, prompt: 'Suggest UI improvements for the orders page following our Svelte 5 + brand.css design tokens.' },
		{ label: 'Review Workflow', icon: ClipboardList, prompt: 'Review the manufacturing workflow stages and suggest optimizations.' },
		{ label: 'System Health', icon: Cpu, prompt: 'Perform a systems health check: summarize the stack, infra, and potential issues.' },
	];

	// ───── Send message ──────────────────────────────────────────────────
	async function sendMessage(content?: string) {
		const query = (content ?? inputValue).trim();
		if (!query || isTyping) return;

		errorMsg = '';
		inputValue = '';

		// Push user message
		chatHistory = [...chatHistory, { role: 'user', content: query, timestamp: new Date() }];

		// Create placeholder assistant message
		const assistantMsg: ChatMessage = { role: 'assistant', content: '', timestamp: new Date() };
		chatHistory = [...chatHistory, assistantMsg];
		isTyping = true;

		try {
			// Build the history payload (exclude the latest empty assistant stub)
			const historyPayload = chatHistory
				.slice(0, -1)
				.map((m) => ({ role: m.role, content: m.content }));

			const res = await fetch(`${base}/api/ai/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query, chatHistory: historyPayload })
			});

			if (!res.ok) {
				const errBody = await res.text();
				throw new Error(errBody || `HTTP ${res.status}`);
			}

			if (!res.body) throw new Error('Empty response body');

			// Stream the response
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let accumulated = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				accumulated += decoder.decode(value, { stream: true });

				// Strip <think>...</think> blocks that deepseek-r1 emits
				const cleaned = accumulated.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

				// Update the last message in-place
				chatHistory = chatHistory.map((m, i) =>
					i === chatHistory.length - 1 ? { ...m, content: cleaned } : m
				);
			}
		} catch (err) {
			errorMsg = (err as Error).message || 'Connection to Hivemind failed.';
			// Remove the empty assistant stub on error
			chatHistory = chatHistory.filter((_, i) => i !== chatHistory.length - 1);
		} finally {
			isTyping = false;
			inputEl?.focus();
		}
	}

	function clearChat() {
		chatHistory = [];
		errorMsg = '';
		inputEl?.focus();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	// ───── Lifecycle ─────────────────────────────────────────────────────
	onMount(() => {
		inputEl?.focus();
	});
</script>

<svelte:head>
	<title>Swarm OS — AI Dashboard — OMS</title>
	<meta name="description" content="Réclame Fabriek AI command center powered by the Hivemind orchestrator." />
</svelte:head>

<div class="ai-dashboard">
	<!-- ── Header ──────────────────────────────────────────────────────── -->
	<header class="dash-header">
		<div class="header-left">
			<div class="header-icon">
				<Bot size={28} />
			</div>
			<div class="header-text">
				<h1>Swarm OS</h1>
				<p class="header-sub">Hivemind Command Center</p>
			</div>
		</div>

		<div class="header-actions">
			{#if hasMessages}
				<button class="action-tag ghost" onclick={clearChat} title="Clear conversation">
					<Trash2 size={16} />
					<span>Clear</span>
				</button>
			{/if}
			<a
				href="http://100.93.147.108:3000"
				target="_blank"
				rel="noopener noreferrer"
				class="action-tag primary"
				title="Open WebUI"
			>
				<ExternalLink size={16} />
				<span>Open WebUI</span>
			</a>
		</div>
	</header>

	<!-- ── Chat Area ──────────────────────────────────────────────────── -->
	<div class="chat-area" bind:this={chatContainer}>
		{#if !hasMessages}
			<!-- Empty state -->
			<div class="empty-hero">
				<div class="hero-orb">
					<Sparkles size={40} />
				</div>
				<h2>What can I help you build?</h2>
				<p>Ask the Hivemind about the codebase, orders, manufacturing workflows, or infrastructure.</p>
			</div>
		{/if}

		{#each chatHistory as msg, idx (idx)}
			<div class="msg-row" class:user={msg.role === 'user'} class:assistant={msg.role === 'assistant'}>
				<div class="msg-avatar">
					{#if msg.role === 'user'}
						<span class="avatar-user">U</span>
					{:else}
						<Bot size={18} />
					{/if}
				</div>
				<div class="msg-bubble">
					{#if msg.content}
						<pre class="msg-text">{msg.content}</pre>
					{:else if isTyping && idx === chatHistory.length - 1}
						<div class="typing-indicator">
							<span></span><span></span><span></span>
						</div>
					{/if}
					<time class="msg-time">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
				</div>
			</div>
		{/each}

		{#if errorMsg}
			<div class="error-banner">
				<RotateCcw size={16} />
				<span>{errorMsg}</span>
				<button class="retry-btn" onclick={() => { errorMsg = ''; sendMessage(chatHistory.at(-1)?.content); }}>Retry</button>
			</div>
		{/if}
	</div>

	<!-- ── Quick Actions ──────────────────────────────────────────────── -->
	{#if !hasMessages}
		<div class="quick-actions">
			{#each quickActions as action}
				<button
					class="qa-btn"
					onclick={() => sendMessage(action.prompt)}
					disabled={isTyping}
				>
					<svelte:component this={action.icon} size={18} />
					<span>{action.label}</span>
				</button>
			{/each}
		</div>
	{/if}

	<!-- ── Input Bar ──────────────────────────────────────────────────── -->
	<div class="input-bar">
		<div class="input-wrap">
			<textarea
				bind:this={inputEl}
				bind:value={inputValue}
				onkeydown={handleKeydown}
				placeholder="Ask the Hivemind…"
				rows="1"
				disabled={isTyping}
				id="ai-chat-input"
			></textarea>
			<button
				class="send-btn"
				onclick={() => sendMessage()}
				disabled={isTyping || !inputValue.trim()}
				title="Send message"
				id="ai-send-btn"
			>
				{#if isTyping}
					<Loader2 size={20} class="spin" />
				{:else}
					<Send size={20} />
				{/if}
			</button>
		</div>
		<p class="input-hint">Powered by <strong>deepseek-r1:14b</strong> · RAG via <strong>nomic-embed-text</strong> · Shift+Enter for new line</p>
	</div>
</div>

<style>
	/* ── Page container ────────────────────────────────────────────────── */
	.ai-dashboard {
		display: flex;
		flex-direction: column;
		height: calc(100vh - var(--topbar-h, 60px));
		max-width: 960px;
		margin: 0 auto;
		padding: 0 var(--space-lg);
	}

	/* ── Header ────────────────────────────────────────────────────────── */
	.dash-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-lg);
		padding: var(--space-lg) 0;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: var(--space-md);
	}

	.header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border-radius: var(--radius-md);
		background: linear-gradient(135deg, var(--accent-1, var(--brand)), color-mix(in oklab, var(--accent-1, var(--brand)) 70%, var(--accent-2, #8fb4ff)));
		color: white;
		flex-shrink: 0;
	}

	.header-text h1 {
		margin: 0;
		font-size: var(--step-2, 1.5rem);
		color: var(--text);
		line-height: 1.2;
	}

	.header-sub {
		margin: 0;
		font-size: var(--step-0, 0.875rem);
		color: var(--muted);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex-shrink: 0;
	}

	/* Action tags — follows brand.css .tag pattern */
	.action-tag {
		display: inline-flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-full);
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		text-decoration: none;
		white-space: nowrap;
		transition: background 0.2s ease, transform 0.2s ease;
		border: 1px solid var(--border);
		background: var(--bg-1);
		color: var(--text);
	}
	.action-tag:hover {
		transform: translateY(-1px);
		background: var(--bg-2);
	}
	.action-tag.primary {
		background: linear-gradient(135deg, var(--accent-1, var(--brand)), color-mix(in oklab, var(--accent-1, var(--brand)) 70%, var(--accent-2, #8fb4ff)));
		color: white;
		border-color: transparent;
	}
	.action-tag.primary:hover {
		box-shadow: 0 4px 12px rgba(var(--shadow-rgb), 0.2);
	}
	.action-tag.ghost {
		background: transparent;
	}

	/* ── Chat area ─────────────────────────────────────────────────────── */
	.chat-area {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-lg) 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		scroll-behavior: smooth;
	}

	/* Empty state hero */
	.empty-hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		text-align: center;
		padding: var(--space-2xl);
		gap: var(--space-md);
		color: var(--muted);
	}

	.hero-orb {
		width: 80px;
		height: 80px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: linear-gradient(135deg, color-mix(in oklab, var(--accent-1, var(--brand)) 20%, transparent), color-mix(in oklab, var(--accent-2, #8fb4ff) 15%, transparent));
		color: var(--accent-1, var(--brand));
		animation: pulse-glow 3s ease-in-out infinite;
	}

	@keyframes pulse-glow {
		0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--accent-1, var(--brand)) 15%, transparent); }
		50% { box-shadow: 0 0 24px 8px color-mix(in oklab, var(--accent-1, var(--brand)) 10%, transparent); }
	}

	.empty-hero h2 {
		margin: 0;
		font-size: var(--step-1, 1.25rem);
		color: var(--text);
	}
	.empty-hero p {
		margin: 0;
		font-size: var(--step-0, 0.9375rem);
		max-width: 420px;
		line-height: 1.5;
	}

	/* ── Message rows ──────────────────────────────────────────────────── */
	.msg-row {
		display: flex;
		gap: var(--space-sm);
		align-items: flex-start;
		max-width: 85%;
	}
	.msg-row.user {
		align-self: flex-end;
		flex-direction: row-reverse;
	}
	.msg-row.assistant {
		align-self: flex-start;
	}

	.msg-avatar {
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 700;
	}
	.msg-row.user .msg-avatar {
		background: var(--accent-1, var(--brand));
		color: white;
	}
	.msg-row.assistant .msg-avatar {
		background: var(--bg-2);
		color: var(--text);
	}
	.avatar-user {
		line-height: 1;
	}

	.msg-bubble {
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-md);
		max-width: 100%;
		position: relative;
	}
	.msg-row.user .msg-bubble {
		background: linear-gradient(135deg, var(--accent-1, var(--brand)), color-mix(in oklab, var(--accent-1, var(--brand)) 80%, var(--accent-2, #8fb4ff)));
		color: white;
		border-bottom-right-radius: var(--radius-sm, 4px);
	}
	.msg-row.assistant .msg-bubble {
		background: var(--bg-1);
		border: 1px solid var(--border);
		color: var(--text);
		border-bottom-left-radius: var(--radius-sm, 4px);
	}

	.msg-text {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
		font-family: inherit;
		font-size: var(--step-0, 0.9375rem);
		line-height: 1.6;
	}

	.msg-time {
		display: block;
		font-size: 0.6875rem;
		opacity: 0.5;
		margin-top: var(--space-xs);
		text-align: right;
	}

	/* Typing dots */
	.typing-indicator {
		display: flex;
		gap: 4px;
		padding: var(--space-xs) 0;
	}
	.typing-indicator span {
		width: 6px;
		height: 6px;
		background: var(--muted);
		border-radius: 50%;
		animation: typing-bounce 1.4s ease-in-out infinite;
	}
	.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
	.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

	@keyframes typing-bounce {
		0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
		40% { transform: translateY(-6px); opacity: 1; }
	}

	/* Error banner */
	.error-banner {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		background: color-mix(in oklab, var(--danger, #dc2626) 12%, transparent);
		border: 1px solid var(--danger, #dc2626);
		border-radius: var(--radius-md);
		color: var(--danger, #dc2626);
		font-size: 0.875rem;
	}
	.retry-btn {
		margin-left: auto;
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		background: var(--danger, #dc2626);
		color: white;
		border: none;
		cursor: pointer;
	}

	/* ── Quick actions ─────────────────────────────────────────────────── */
	.quick-actions {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--space-sm);
		padding-bottom: var(--space-md);
		flex-shrink: 0;
	}

	.qa-btn {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-md);
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		text-align: left;
		transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
	}
	.qa-btn:hover:not(:disabled) {
		background: var(--bg-2);
		border-color: var(--accent-1, var(--brand));
		transform: translateY(-2px);
	}
	.qa-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ── Input bar ─────────────────────────────────────────────────────── */
	.input-bar {
		flex-shrink: 0;
		padding: var(--space-md) 0 var(--space-lg);
		border-top: 1px solid var(--border);
	}

	.input-wrap {
		display: flex;
		align-items: flex-end;
		gap: var(--space-sm);
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-sm);
		transition: border-color 0.2s ease, box-shadow 0.2s ease;
	}
	.input-wrap:focus-within {
		border-color: var(--accent-1, var(--brand));
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent-1, var(--brand)) 20%, transparent);
	}

	.input-wrap textarea {
		flex: 1;
		border: none;
		background: transparent;
		color: var(--text);
		font-family: inherit;
		font-size: var(--step-0, 0.9375rem);
		resize: none;
		min-height: 24px;
		max-height: 120px;
		line-height: 1.5;
		padding: var(--space-xs) var(--space-sm);
		outline: none;
		box-shadow: none;
	}
	.input-wrap textarea::placeholder {
		color: var(--muted);
		opacity: 0.6;
	}

	.send-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
		border: none;
		background: linear-gradient(135deg, var(--accent-1, var(--brand)), color-mix(in oklab, var(--accent-1, var(--brand)) 70%, var(--accent-2, #8fb4ff)));
		color: white;
		cursor: pointer;
		flex-shrink: 0;
		transition: transform 0.2s ease, opacity 0.2s ease;
	}
	.send-btn:hover:not(:disabled) {
		transform: scale(1.05);
	}
	.send-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.input-hint {
		margin: var(--space-xs) 0 0;
		font-size: 0.6875rem;
		color: var(--muted);
		opacity: 0.6;
		text-align: center;
	}

	/* Spinner animation for the loading state */
	:global(.spin) {
		animation: spin-anim 1s linear infinite;
	}
	@keyframes spin-anim {
		to { transform: rotate(360deg); }
	}

	/* ── Responsive ────────────────────────────────────────────────────── */
	@media (max-width: 768px) {
		.ai-dashboard {
			padding: 0 var(--space-md);
		}
		.dash-header {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--space-sm);
		}
		.header-actions {
			align-self: flex-end;
		}
		.msg-row {
			max-width: 95%;
		}
		.quick-actions {
			grid-template-columns: 1fr 1fr;
		}
		.action-tag span {
			display: none;
		}
	}

	@media (max-width: 480px) {
		.quick-actions {
			grid-template-columns: 1fr;
		}
	}
</style>
