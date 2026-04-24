<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import {
		Bot, Send, ExternalLink, ClipboardList, Paintbrush,
		BarChart3, Cpu, Loader2, Trash2, RotateCcw, Sparkles, Building2,
		Paperclip, Image as ImageIcon, Activity, ChevronDown, ChevronRight, X
	} from 'lucide-svelte';
	import { t } from 'svelte-i18n';
	import { currentUser } from '$lib/auth/authState.svelte';

	// ───── Types ─────────────────────────────────────────────────────────
	interface ChatMessage {
		role: 'user' | 'assistant';
		content: string;
		thoughtProcess?: string;
		timestamp: Date;
		images?: string[]; // base64
		files?: File[];
	}

	// ───── State (Svelte 5 runes) ────────────────────────────────────────
	let chatHistory: ChatMessage[] = $state([]);
	let inputValue: string = $state('');
	let isTyping: boolean = $state(false);
	let chatContainer: HTMLElement | undefined = $state(undefined);
	let inputEl: HTMLTextAreaElement | undefined = $state(undefined);
	let errorMsg: string = $state('');
	
	let selectedImages: string[] = $state([]);
	let selectedFiles: File[] = $state([]);
	let isDragging = $state(false);
	let thoughtsOpen: boolean[] = $state([]);

	let agentStatuses: Record<string, 'idle' | 'active'> = $state({
		router: 'idle',
		reasoning: 'idle',
		engineer: 'idle',
		vision: 'idle'
	});

	let agentsList = $derived([
		{ id: 'router', name: $t('swarm.agents.router', { default: 'Librarian' }), icon: Sparkles, status: agentStatuses.router, color: 'var(--ok)' },
		{ id: 'reasoning', name: $t('swarm.agents.reasoning', { default: 'The Brain' }), icon: BarChart3, status: agentStatuses.reasoning, color: 'var(--link)' },
		{ id: 'engineer', name: $t('swarm.agents.engineer', { default: 'The Coder' }), icon: Cpu, status: agentStatuses.engineer, color: 'var(--warn)' },
		{ id: 'vision', name: $t('swarm.agents.vision', { default: 'The Eyes' }), icon: ImageIcon, status: agentStatuses.vision, color: 'var(--accent-2, #8b5cf6)' },
	]);

	// ───── Derived ───────────────────────────────────────────────────────
	let hasMessages = $derived(chatHistory.length > 0);

	// ───── Scroll behaviour ──────────────────────────────────────────────
	$effect(() => {
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

	function toggleThought(idx: number) {
		thoughtsOpen[idx] = !thoughtsOpen[idx];
	}

	// ───── Dropzone Handlers ──────────────────────────────────────────────
	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		if (e.dataTransfer?.files) {
			handleFiles(Array.from(e.dataTransfer.files));
		}
	}

	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files) {
			handleFiles(Array.from(input.files));
		}
		input.value = ''; // reset
	}

	async function handleFiles(files: File[]) {
		for (const file of files) {
			if (file.type.startsWith('image/')) {
				const reader = new FileReader();
				reader.onload = (e) => {
					if (e.target?.result) {
						selectedImages = [...selectedImages, e.target.result as string];
					}
				};
				reader.readAsDataURL(file);
			} else {
				selectedFiles = [...selectedFiles, file];
			}
		}
	}

	function removeImage(index: number) {
		selectedImages = selectedImages.filter((_, i) => i !== index);
	}

	function removeFile(index: number) {
		selectedFiles = selectedFiles.filter((_, i) => i !== index);
	}

	// ───── Quick actions ────────────────────────────────────────────────
	let quickActions = $derived([
		{ label: $t('swarm.analyze_orders', { default: 'Analyze Orders' }), icon: BarChart3, prompt: 'Analyze the current order pipeline and identify bottlenecks or at-risk deadlines.' },
		{ label: $t('swarm.refactor_ui', { default: 'Refactor UI' }), icon: Paintbrush, prompt: 'Suggest UI improvements for the orders page following our Svelte 5 + brand.css design tokens.' },
		{ label: $t('swarm.review_workflow', { default: 'Review Workflow' }), icon: ClipboardList, prompt: 'Review the manufacturing workflow stages and suggest optimizations.' },
		{ label: $t('swarm.system_health', { default: 'System Health' }), icon: Cpu, prompt: 'Perform a systems health check: summarize the stack, infra, and potential issues.' },
		{ label: $t('swarm.our_capabilities', { default: 'Our Capabilities' }), icon: Building2, prompt: 'Summarize Réclame Fabriek\'s capabilities, past projects, and core services based on our corporate identity.' },
	]);

	// ───── Send message ──────────────────────────────────────────────────
	async function sendMessage(content?: string) {
		const query = (content ?? inputValue).trim();
		if ((!query && selectedImages.length === 0 && selectedFiles.length === 0) || isTyping) return;

		errorMsg = '';
		inputValue = '';

		const currentImages = [...selectedImages];
		const currentFiles = [...selectedFiles];
		
		selectedImages = [];
		selectedFiles = [];

		chatHistory = [...chatHistory, { 
			role: 'user', 
			content: query, 
			images: currentImages,
			files: currentFiles,
			timestamp: new Date() 
		}];
		thoughtsOpen[chatHistory.length - 1] = false;

		let assistantMessageIndex = chatHistory.length;
		chatHistory.push({ role: 'assistant', content: '', timestamp: new Date() });
		thoughtsOpen[assistantMessageIndex] = true; // open by default while typing
		isTyping = true;
		
		agentStatuses.router = 'active';

		try {
			const historyPayload = chatHistory
				.slice(0, -1)
				.map((m) => {
					const messageObj: any = { role: m.role, content: m.content };
					if (m.images && m.images.length > 0) {
						messageObj.images = m.images.map(img => img.split(',')[1] || img);
					}
					return messageObj;
				});

			const payload: any = { 
				query, 
				chatHistory: historyPayload 
			};
			
			if (currentImages.length > 0) {
				payload.images = currentImages.map(img => img.split(',')[1] || img);
			}

			// Read file text context (very naive implementation for .txt files)
			let fileContext = '';
			for (const file of currentFiles) {
				if (file.type === 'text/plain' || file.name.endsWith('.md')) {
					const text = await file.text();
					fileContext += `\n\n--- Content of ${file.name} ---\n${text}`;
				}
			}
			if (fileContext) {
				payload.query += `\n\n[Attached Files Context]:${fileContext}`;
			}

			const res = await fetch(`${base}/api/ai/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				const errBody = await res.text();
				throw new Error(errBody || `HTTP ${res.status}`);
			}

			if (!res.body) throw new Error('Empty response body');

			const routedAgent = res.headers.get('x-agent-routed') || 'router';
			Object.keys(agentStatuses).forEach(k => agentStatuses[k] = 'idle');
			if (agentStatuses[routedAgent] !== undefined) {
				agentStatuses[routedAgent] = 'active';
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let accumulated = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunkText = decoder.decode(value, { stream: true });
				accumulated += chunkText;

				let thoughtProcess = '';
				let finalContent = accumulated;

				const thinkMatch = accumulated.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
				if (thinkMatch) {
					thoughtProcess = thinkMatch[1].trim();
					finalContent = accumulated.replace(/<think>[\s\S]*?(?:<\/think>|$)/, '').trimStart();
				}

				chatHistory[assistantMessageIndex].thoughtProcess = thoughtProcess;
				chatHistory[assistantMessageIndex].content = finalContent;
			}
			
			// Close thought process after done
			thoughtsOpen[assistantMessageIndex] = false;
		} catch (err) {
			errorMsg = (err as Error).message || 'Connection to Hivemind failed.';
			chatHistory = chatHistory.filter((_, i) => i !== chatHistory.length - 1);
		} finally {
			isTyping = false;
			Object.keys(agentStatuses).forEach(k => agentStatuses[k] = 'idle');
			inputEl?.focus();
		}
	}

	function clearChat() {
		chatHistory = [];
		thoughtsOpen = [];
		errorMsg = '';
		inputEl?.focus();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	onMount(() => {
		inputEl?.focus();
	});
</script>

<svelte:head>
	<title>{$t('swarm.nav_title', { default: 'Swarm OS' })}</title>
	<meta name="description" content="Réclame Fabriek Sovereign AI Swarm Command Center." />
</svelte:head>

<div class="ai-dashboard glass-panel"
	 ondragover={handleDragOver}
	 ondragleave={handleDragLeave}
	 ondrop={handleDrop}
	 role="region"
	 aria-label="Dropzone"
>
	{#if isDragging}
		<div class="drag-overlay">
			<ImageIcon size={48} />
			<p>{$t('swarm.drop_hint', { default: 'Drop images or tech manuals here' })}</p>
		</div>
	{/if}

	<!-- ── Header & Agents Status ──────────────────────────────────────── -->
	<header class="dash-header">
		<div class="header-left">
			<div class="header-icon pulse-glow-subtle">
				<Activity size={24} />
			</div>
			<div class="header-text">
				<h1>{$t('swarm.title', { default: 'Sovereign Swarm' })}</h1>
				<p class="header-sub">{$t('swarm.subtitle', { default: 'Command Center & Intelligence Router' })}</p>
			</div>
		</div>

		<div class="agents-bar">
			{#each agentsList as agent}
				<div class="agent-badge {agent.status}" style="--agent-color: {agent.color}">
					<div class="agent-indicator"></div>
					<svelte:component this={agent.icon} size={14} />
					<span class="desktop-only">{agent.name}</span>
				</div>
			{/each}
		</div>

		<div class="header-actions">
			{#if hasMessages}
				<button class="action-tag ghost" onclick={clearChat} title={$t('swarm.clear', { default: 'Clear' })}>
					<Trash2 size={16} />
					<span class="desktop-only">{$t('swarm.clear', { default: 'Clear' })}</span>
				</button>
			{/if}
			<a href="http://100.93.147.108:3000" target="_blank" rel="noopener noreferrer" class="action-tag primary" title={$t('swarm.webui', { default: 'WebUI' })}>
				<ExternalLink size={16} />
				<span class="desktop-only">{$t('swarm.webui', { default: 'WebUI' })}</span>
			</a>
		</div>
	</header>

	<!-- ── Chat Area ──────────────────────────────────────────────────── -->
	<div class="chat-area" bind:this={chatContainer}>
		{#if !hasMessages}
			<div class="empty-hero">
				<div class="hero-orb">
					<Sparkles size={40} />
				</div>
				<h2>{$t('swarm.awaiting', { default: 'Awaiting Commands' })}</h2>
				<p>{$t('swarm.upload_hint', { default: 'Upload Dino-Lite PCB images, drop tech manuals, or request CNC workflow optimizations.' })}</p>
			</div>
		{/if}

		{#each chatHistory as msg, idx (idx)}
			<div class="msg-row" class:user={msg.role === 'user'} class:assistant={msg.role === 'assistant'}>
				<div class="msg-avatar">
					{#if msg.role === 'user'}
						{#if $currentUser}
							<div class="user-avatar" title={$currentUser.display_name || $currentUser.username}>
								{($currentUser.display_name || $currentUser.username || 'U').charAt(0).toUpperCase()}
							</div>
						{:else}
							<span class="avatar-user">U</span>
						{/if}
					{:else}
						<Bot size={18} />
					{/if}
				</div>
				<div class="msg-bubble">
					<!-- User Attachments -->
					{#if msg.images && msg.images.length > 0}
						<div class="msg-attachments">
							{#each msg.images as img}
								<img src={img} alt="Uploaded" class="msg-image" />
							{/each}
						</div>
					{/if}
					{#if msg.files && msg.files.length > 0}
						<div class="msg-attachments files">
							{#each msg.files as file}
								<div class="msg-file-tag">
									<Paperclip size={14} /> {file.name}
								</div>
							{/each}
						</div>
					{/if}

					<!-- Assistant Thoughts -->
					{#if msg.thoughtProcess}
						<div class="thought-process">
							<button class="thought-toggle" onclick={() => toggleThought(idx)}>
								{#if thoughtsOpen[idx]}
									<ChevronDown size={14} />
								{:else}
									<ChevronRight size={14} />
								{/if}
								<span>{$t('swarm.thought_process', { default: 'AI Thought Process' })}</span>
							</button>
							{#if thoughtsOpen[idx]}
								<div class="thought-content">
									{msg.thoughtProcess}
								</div>
							{/if}
						</div>
					{/if}

					<!-- Content -->
					{#if msg.content}
						<div class="msg-text">
							<!-- Hacky markdown render for now -->
							{@html msg.content.replace(/\n/g, '<br/>')}
						</div>
					{:else if isTyping && idx === chatHistory.length - 1 && !msg.thoughtProcess}
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
				<button class="retry-btn" onclick={() => { errorMsg = ''; sendMessage(chatHistory.at(-1)?.content); }}>{$t('swarm.retry', { default: 'Retry' })}</button>
			</div>
		{/if}
	</div>

	<!-- ── Quick Actions ──────────────────────────────────────────────── -->
	{#if !hasMessages}
		<div class="quick-actions">
			{#each quickActions as action}
				<button class="qa-btn glass-btn" onclick={() => sendMessage(action.prompt)} disabled={isTyping}>
					<svelte:component this={action.icon} size={18} />
					<span>{action.label}</span>
				</button>
			{/each}
		</div>
	{/if}

	<!-- ── Attachments Preview ────────────────────────────────────────── -->
	{#if selectedImages.length > 0 || selectedFiles.length > 0}
		<div class="attachments-preview">
			{#each selectedImages as img, i}
				<div class="preview-item image">
					<img src={img} alt="Preview" />
					<button class="remove-btn" onclick={() => removeImage(i)}><X size={14} /></button>
				</div>
			{/each}
			{#each selectedFiles as file, i}
				<div class="preview-item file">
					<Paperclip size={14} />
					<span>{file.name}</span>
					<button class="remove-btn" onclick={() => removeFile(i)}><X size={14} /></button>
				</div>
			{/each}
		</div>
	{/if}

	<!-- ── Input Bar ──────────────────────────────────────────────────── -->
	<div class="input-bar">
		<div class="input-wrap">
			<label class="attach-btn" title="Attach image or file">
				<Paperclip size={20} />
				<input type="file" multiple onchange={handleFileInput} style="display: none;" />
			</label>
			<textarea
				bind:this={inputEl}
				bind:value={inputValue}
				onkeydown={handleKeydown}
				placeholder={$t('swarm.input_placeholder', { default: 'Initialize command sequence...' })}
				rows="1"
				disabled={isTyping}
				id="ai-chat-input"
			></textarea>
			<button class="send-btn" onclick={() => sendMessage()} disabled={isTyping || (!inputValue.trim() && selectedImages.length === 0 && selectedFiles.length === 0)} title="Transmit">
				{#if isTyping}
					<Loader2 size={20} class="spin" />
				{:else}
					<Send size={20} />
				{/if}
			</button>
		</div>
		<p class="input-hint">{$t('swarm.input_hint_powered', { default: 'Powered by' })} <strong>{$t('swarm.input_hint_router', { default: 'Sovereign Swarm Router' })}</strong> · {$t('swarm.input_hint_dynamic', { default: 'Dynamic Q4_K_M allocation' })} · {$t('swarm.input_hint_shortcut', { default: 'Shift+Enter for new line' })}</p>
	</div>
</div>

<style>
	/* ── Native Tokens / Glassmorphism / CNC Aesthetic ────────────────────────── */
	.ai-dashboard {
		display: flex;
		flex-direction: column;
		height: calc(100vh - var(--topbar-h, 60px));
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 var(--space-lg);
		position: relative;
	}

	.glass-panel {
		background: color-mix(in oklab, var(--bg-1) 80%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-left: 1px solid var(--border);
		border-right: 1px solid var(--border);
		box-shadow: var(--shadow-lg);
	}

	.drag-overlay {
		position: absolute;
		top: 0; left: 0; right: 0; bottom: 0;
		background: color-mix(in oklab, var(--brand, var(--accent-1)) 10%, transparent);
		backdrop-filter: blur(4px);
		border: 2px dashed var(--brand, var(--accent-1));
		z-index: 50;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: var(--brand, var(--accent-1));
		font-weight: var(--font-weight-bold);
		font-size: var(--font-size-xl);
		gap: var(--space-md);
		border-radius: var(--radius-md);
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
		background: var(--bg-2);
		border: 1px solid var(--border);
		color: var(--brand, var(--accent-1));
		flex-shrink: 0;
	}

	.pulse-glow-subtle {
		box-shadow: 0 0 15px color-mix(in oklab, var(--brand, var(--accent-1)) 20%, transparent);
	}

	.header-text h1 {
		margin: 0;
		font-size: var(--font-size-2xl);
		color: var(--text);
		font-weight: var(--font-weight-bold);
		letter-spacing: -0.02em;
	}

	.header-sub {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* ── Agents Bar ────────────────────────────────────────────────────── */
	.agents-bar {
		display: flex;
		gap: var(--space-sm);
		background: var(--bg-0);
		padding: 8px 16px;
		border-radius: var(--radius-full);
		border: 1px solid var(--border);
	}

	.agent-badge {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--muted);
		opacity: 0.6;
		transition: all var(--transition-fast, 0.2s) ease;
	}

	.agent-badge.active {
		opacity: 1;
		color: var(--text);
	}

	.agent-indicator {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background-color: var(--muted);
		transition: background-color 0.3s ease, box-shadow 0.3s ease;
	}

	.agent-badge.active .agent-indicator {
		background-color: var(--agent-color);
		box-shadow: 0 0 8px var(--agent-color);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex-shrink: 0;
	}

	.action-tag {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: var(--radius-full);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		cursor: pointer;
		text-decoration: none;
		border: 1px solid var(--border);
		background: var(--bg-0);
		color: var(--text);
		transition: all 0.2s ease;
	}
	.action-tag:hover {
		background: var(--bg-2);
	}
	.action-tag.primary {
		background: var(--brand, var(--accent-1));
		color: var(--bg-0);
		border-color: transparent;
	}
	.action-tag.primary:hover {
		box-shadow: 0 0 15px color-mix(in oklab, var(--brand, var(--accent-1)) 40%, transparent);
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
		background: color-mix(in oklab, var(--brand, var(--accent-1)) 10%, transparent);
		color: var(--brand, var(--accent-1));
		border: 1px solid color-mix(in oklab, var(--brand, var(--accent-1)) 20%, transparent);
		animation: pulse-glow 3s ease-in-out infinite;
	}

	@keyframes pulse-glow {
		0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--brand, var(--accent-1)) 10%, transparent); }
		50% { box-shadow: 0 0 30px 10px color-mix(in oklab, var(--brand, var(--accent-1)) 15%, transparent); }
	}

	.empty-hero h2 {
		margin: 0;
		font-size: var(--font-size-xl);
		color: var(--text);
		letter-spacing: 0.05em;
		text-transform: uppercase;
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
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);
	}
	.msg-row.user .msg-avatar, .user-avatar {
		background: var(--bg-2);
		border: 1px solid var(--border);
		color: var(--text);
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
	}
	.msg-row.assistant .msg-avatar {
		background: var(--brand, var(--accent-1));
		color: var(--bg-0);
	}

	.msg-bubble {
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-md);
		max-width: 100%;
		position: relative;
	}
	.msg-row.user .msg-bubble {
		background: var(--bg-2);
		border: 1px solid var(--border);
		color: var(--text);
		border-top-right-radius: 4px;
	}
	.msg-row.assistant .msg-bubble {
		background: var(--bg-0);
		border: 1px solid var(--brand, var(--accent-1));
		color: var(--text);
		border-top-left-radius: 4px;
	}

	.msg-text {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
		line-height: 1.6;
		font-size: var(--font-size-base);
	}

	.thought-process {
		margin-bottom: var(--space-sm);
		border: 1px solid var(--border);
		background: var(--bg-0);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.thought-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px 12px;
		background: var(--bg-1);
		border: none;
		color: var(--muted);
		font-size: var(--font-size-sm);
		font-family: monospace;
		cursor: pointer;
		text-align: left;
	}
	
	.thought-toggle:hover {
		background: var(--bg-2);
		color: var(--text);
	}

	.thought-content {
		padding: 12px;
		font-family: monospace;
		font-size: var(--font-size-sm);
		color: var(--muted);
		border-top: 1px solid var(--border);
		white-space: pre-wrap;
	}

	.msg-attachments {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 8px;
	}

	.msg-image {
		max-width: 200px;
		max-height: 200px;
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
	}

	.msg-file-tag {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		background: var(--bg-1);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
		color: var(--text);
	}

	.msg-time {
		display: block;
		font-size: var(--font-size-xs);
		color: var(--muted);
		margin-top: 8px;
		text-align: right;
	}

	.typing-indicator {
		display: flex;
		gap: 4px;
		padding: 8px 0;
	}
	.typing-indicator span {
		width: 6px;
		height: 6px;
		background: var(--brand, var(--accent-1));
		border-radius: 50%;
		animation: typing-bounce 1.4s ease-in-out infinite;
	}
	.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
	.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

	@keyframes typing-bounce {
		0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
		40% { transform: translateY(-6px); opacity: 1; }
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: color-mix(in oklab, var(--danger) 10%, transparent);
		border: 1px solid var(--danger);
		border-radius: var(--radius-md);
		color: var(--danger);
		font-size: var(--font-size-sm);
	}
	.retry-btn {
		margin-left: auto;
		padding: 4px 8px;
		border-radius: var(--radius-sm);
		background: var(--danger);
		color: white;
		border: none;
		cursor: pointer;
	}

	/* ── Quick actions ─────────────────────────────────────────────────── */
	.quick-actions {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 12px;
		padding-bottom: 16px;
	}

	.qa-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px;
		background: color-mix(in oklab, var(--bg-1) 50%, transparent);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--font-size-sm);
		cursor: pointer;
		text-align: left;
		transition: all 0.2s ease;
	}
	.qa-btn:hover:not(:disabled) {
		background: var(--bg-2);
		border-color: var(--brand, var(--accent-1));
		transform: translateY(-2px);
		box-shadow: var(--shadow-md);
	}

	/* ── Attachments Preview ───────────────────────────────────────────── */
	.attachments-preview {
		display: flex;
		gap: 12px;
		padding: 12px 0;
		border-top: 1px solid var(--border);
		flex-wrap: wrap;
	}

	.preview-item {
		position: relative;
		border-radius: var(--radius-md);
		overflow: hidden;
		border: 1px solid var(--border);
		background: var(--bg-1);
		display: flex;
		align-items: center;
		padding: 4px 12px 4px 8px;
		gap: 8px;
		font-size: var(--font-size-sm);
	}

	.preview-item.image img {
		height: 40px;
		width: 40px;
		object-fit: cover;
		border-radius: var(--radius-sm);
		margin: -4px 0 -4px -8px;
	}

	.remove-btn {
		position: absolute;
		top: 2px;
		right: 2px;
		background: var(--bg-2);
		color: var(--text);
		border: none;
		border-radius: 50%;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.remove-btn:hover {
		background: var(--danger);
		color: white;
	}

	/* ── Input bar ─────────────────────────────────────────────────────── */
	.input-bar {
		flex-shrink: 0;
		padding: 16px 0 24px;
		border-top: 1px solid var(--border);
	}

	.input-wrap {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 8px;
		transition: all 0.2s ease;
	}
	.input-wrap:focus-within {
		border-color: var(--brand, var(--accent-1));
		box-shadow: 0 0 0 2px color-mix(in oklab, var(--brand, var(--accent-1)) 20%, transparent);
	}

	.attach-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		color: var(--muted);
		cursor: pointer;
		border-radius: var(--radius-md);
	}
	.attach-btn:hover {
		background: var(--bg-2);
		color: var(--text);
	}

	.input-wrap textarea {
		flex: 1;
		border: none;
		background: transparent;
		color: var(--text);
		font-family: inherit;
		font-size: var(--font-size-base);
		resize: none;
		min-height: 24px;
		max-height: 120px;
		line-height: 1.5;
		padding: 8px 0;
		outline: none;
	}
	.input-wrap textarea::placeholder {
		color: var(--muted);
	}

	.send-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
		border: none;
		background: var(--brand, var(--accent-1));
		color: var(--bg-0);
		cursor: pointer;
		transition: all 0.2s ease;
	}
	.send-btn:hover:not(:disabled) {
		transform: scale(1.05);
		box-shadow: 0 0 10px color-mix(in oklab, var(--brand, var(--accent-1)) 50%, transparent);
	}
	.send-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.input-hint {
		margin: 8px 0 0;
		font-size: var(--font-size-xs);
		color: var(--muted);
		text-align: center;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	:global(.spin) {
		animation: spin-anim 1s linear infinite;
	}
	@keyframes spin-anim {
		to { transform: rotate(360deg); }
	}

	@media (max-width: 768px) {
		.desktop-only { display: none; }
		.dash-header { flex-direction: column; align-items: flex-start; }
		.header-actions { align-self: flex-end; }
	}
</style>
