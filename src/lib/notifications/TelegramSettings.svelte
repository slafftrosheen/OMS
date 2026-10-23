<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t, locale } from 'svelte-i18n';
  import { base } from '$app/paths';
  import Send from 'lucide-svelte/icons/send';
  import Smartphone from 'lucide-svelte/icons/smartphone';
  import Check from 'lucide-svelte/icons/check';
  import Pause from 'lucide-svelte/icons/pause';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import ExternalLink from 'lucide-svelte/icons/external-link';

  interface TelegramStatus {
    configured: boolean;
    available: boolean;
    connected: boolean;
    enabled: boolean;
    username: string | null;
    linkedAt: string | null;
    pendingUntil: string | null;
    botUsername: string | null;
  }

  type Operation = 'load' | 'connect' | 'save' | 'disconnect';
  let status = $state<TelegramStatus | null>(null);
  let busy = $state<Operation | null>(null);
  let error = $state('');
  let feedback = $state('');
  let link = $state<{ url: string; expiresAt: string } | null>(null);
  let qrData = $state('');
  let qrUnavailable = $state(false);
  let now = $state(Date.now());
  let openLink: HTMLAnchorElement | undefined = $state();
  let mounted = false;
  let controller: AbortController | null = null;
  let finalStatusCheck = false;
  let checkedExpiry: string | null = null;
  const endpoint = `${base}/api/notifications/telegram`;

  const pending = $derived(Boolean(status?.pendingUntil && Date.parse(status.pendingUntil) > now));
  const stateKey = $derived(!status?.configured ? 'notConfigured'
    : !status.available ? 'unavailable'
    : status.connected ? (status.enabled ? 'connected' : 'paused')
    : pending ? 'pending' : 'notLinked');

  function requestError(code: string) {
    if (code === 'unauthorized' || code === 'UNAUTHORIZED') return $t('settings.telegram.errors.signIn');
    if (code === 'link_rate_limited') return $t('settings.telegram.errors.rateLimited');
    if (/conflict|already_linked|already_connected/i.test(code)) return $t('settings.telegram.errors.conflict');
    if (/not_configured|unavailable|disabled/i.test(code)) return $t('settings.telegram.errors.unavailable');
    return $t('settings.telegram.errors.request');
  }

  async function request(method: string, signal: AbortSignal, body?: object) {
    const response = await fetch(endpoint, {
      method,
      signal,
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(response.status === 401 ? $t('settings.telegram.errors.signIn') : requestError(data?.code ?? ''));
    }
    if (!data || typeof data !== 'object') throw new Error($t('settings.telegram.errors.request'));
    return data;
  }

  function acceptStatus(data: TelegramStatus) {
    if (['configured', 'available', 'connected', 'enabled'].some(key => typeof data[key as keyof TelegramStatus] !== 'boolean')) {
      throw new Error($t('settings.telegram.errors.request'));
    }
    status = data;
    now = Date.now();
    if (data.connected || !data.configured || !data.available || !data.pendingUntil || Date.parse(data.pendingUntil) <= now
      || (link && Date.parse(data.pendingUntil) !== Date.parse(link.expiresAt))) {
      link = null;
      qrData = '';
    }
  }

  async function perform(operation: Operation, action: (signal: AbortSignal) => Promise<void>, quiet = false) {
    if (!mounted || busy) return;
    busy = operation;
    if (!quiet) { error = ''; feedback = ''; }
    const current = new AbortController();
    controller = current;
    const timeout = setTimeout(() => current.abort(), 12000);
    try {
      await action(current.signal);
    } catch (cause) {
      if (mounted) error = current.signal.aborted ? $t('settings.telegram.errors.timeout')
        : cause instanceof Error ? cause.message : $t('settings.telegram.errors.request');
    } finally {
      clearTimeout(timeout);
      if (mounted) busy = null;
      if (controller === current) controller = null;
    }
  }

  async function loadStatus(quiet = false) {
    await perform('load', async signal => {
      const data = await request('GET', signal);
      if (!mounted || signal.aborted) return;
      const wasPending = pending || finalStatusCheck;
      const expired = finalStatusCheck;
      acceptStatus(data);
      finalStatusCheck = false;
      error = '';
      if (wasPending && data.connected) feedback = $t('settings.telegram.linked');
      else if (expired && !data.connected) feedback = $t('settings.telegram.expired');
    }, quiet);
  }

  async function connect() {
    await perform('connect', async signal => {
      const data = await request('POST', signal, { action: 'connect' });
      if (!mounted || signal.aborted) return;
      let url: URL;
      try { url = new URL(data.url); } catch { throw new Error($t('settings.telegram.errors.request')); }
      if (url.origin !== 'https://t.me' || url.pathname !== `/${status?.botUsername}`
        || !/^[A-Za-z0-9_-]{20,64}$/.test(url.searchParams.get('start') ?? '')
        || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now()) {
        throw new Error($t('settings.telegram.errors.request'));
      }
      link = { url: url.href, expiresAt: data.expiresAt };
      if (status) status = { ...status, pendingUntil: data.expiresAt };
      qrData = '';
      qrUnavailable = false;
      checkedExpiry = null;
      finalStatusCheck = false;
      void createQrCode(url.href);
      if (mounted && !signal.aborted) { await tick(); openLink?.focus(); }
    });
  }

  async function createQrCode(requestedUrl: string) {
    try {
      const { default: QRCode } = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(requestedUrl, { width: 192, margin: 2, errorCorrectionLevel: 'M' });
      if (mounted && link?.url === requestedUrl && Date.parse(link.expiresAt) > Date.now()) qrData = dataUrl;
    } catch {
      if (mounted && link?.url === requestedUrl) qrUnavailable = true;
    }
  }

  async function setEnabled() {
    if (!status?.connected) return;
    const enabled = !status.enabled;
    await perform('save', async signal => {
      const saved = await request('PATCH', signal, { enabled });
      // Older servers returned only success; keep rolling deployments usable.
      const data = saved.status ?? await request('GET', signal);
      if (!mounted || signal.aborted) return;
      acceptStatus(data);
      feedback = $t(enabled ? 'settings.telegram.resumed' : 'settings.telegram.pauseSaved');
    });
  }

  async function disconnect() {
    await perform('disconnect', async signal => {
      await request('DELETE', signal);
      if (!mounted || signal.aborted) return;
      link = null;
      qrData = '';
      finalStatusCheck = false;
      if (status) status = { ...status, connected: false, enabled: false, username: null, linkedAt: null, pendingUntil: null };
      feedback = $t('settings.telegram.disconnected');
    });
  }

  function expiryLabel(value: string) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleTimeString($locale || 'en', { hour: '2-digit', minute: '2-digit' }) : '';
  }

  onMount(() => {
    mounted = true;
    void loadStatus();
    const refreshOnFocus = () => { if ((pending || finalStatusCheck) && !document.hidden) void loadStatus(true); };
    const timer = window.setInterval(() => {
      now = Date.now();
      if (status?.pendingUntil && Date.parse(status.pendingUntil) <= now && checkedExpiry !== status.pendingUntil) {
        checkedExpiry = status.pendingUntil;
        finalStatusCheck = true;
      }
      if (link && Date.parse(link.expiresAt) <= now) {
        link = null;
        qrData = '';
      }
      refreshOnFocus();
    }, 5000);
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      mounted = false;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshOnFocus);
    };
  });
</script>

<div class="telegram-settings" aria-labelledby="telegram-heading" data-state={status ? stateKey : 'loading'}>
  <div class="telegram-heading">
    <div class="telegram-title">
      <Send size={21} aria-hidden="true" />
      <h3 id="telegram-heading">Telegram</h3>
    </div>
    {#if status}
      <span class="connection-status" data-tone={status.connected && status.enabled ? 'success' : 'neutral'}>
        {#if status.connected && status.enabled}<Check size={14} aria-hidden="true" />
        {:else if status.connected}<Pause size={14} aria-hidden="true" />{/if}
        {$t(`settings.telegram.status.${stateKey}`)}
      </span>
    {/if}
  </div>
  <p class="description">{$t('settings.telegram.description')}</p>

  {#if !status && busy}
    <p class="hint" role="status">{$t('settings.telegram.loading')}</p>
  {:else if status && !status.configured}
    <p class="setup-hint">{$t('settings.telegram.setupHint')}</p>
  {:else if status && !status.available}
    <p class="setup-hint">{$t('settings.telegram.unavailableHint')}</p>
  {:else if status?.connected}
    <p class="account">
      <Smartphone size={16} aria-hidden="true" />
      {status.username ? $t('settings.telegram.account', { username: status.username }) : $t('settings.telegram.privateChat')}
    </p>
    <p class="hint">{$t(status.enabled ? 'settings.telegram.deliveryHint' : 'settings.telegram.pausedHint')}</p>
    <div class="actions">
      <button type="button" class="telegram-button" onclick={setEnabled} disabled={Boolean(busy)}>
        {status.enabled ? $t('settings.telegram.pause') : $t('settings.telegram.resume')}
      </button>
      <button type="button" class="telegram-button subtle" onclick={disconnect} disabled={Boolean(busy)}>
        {$t('settings.telegram.disconnect')}
      </button>
    </div>
  {:else if status?.available}
    {#if link && pending}
      <div class="link-instructions">
        {#if qrData}
          <img class="telegram-qr" src={qrData} width="192" height="192" alt={$t('settings.telegram.qrAlt')} />
        {/if}
        <div class="link-copy">
          <h4>{$t('settings.telegram.linkTitle')}</h4>
          <p>{$t('settings.telegram.linkInstructions')}</p>
          <a bind:this={openLink} class="telegram-button primary" href={link.url} target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">
            {$t('settings.telegram.openTelegram')}<ExternalLink size={15} aria-hidden="true" />
          </a>
          <p class="hint">{$t('settings.telegram.expires', { time: expiryLabel(link.expiresAt) })}</p>
          {#if qrUnavailable}<p class="hint">{$t('settings.telegram.qrUnavailable')}</p>{/if}
        </div>
      </div>
    {:else}
      <p class="hint">{$t(pending ? 'settings.telegram.pendingHint' : 'settings.telegram.connectHint')}</p>
    {/if}
    <div class="actions">
      {#if !link || !pending}
        <button type="button" class="telegram-button primary" onclick={connect} disabled={Boolean(busy)}>
          {busy === 'connect' ? $t('settings.telegram.creatingLink') : $t(pending ? 'settings.telegram.newLink' : 'settings.telegram.connect')}
        </button>
      {/if}
      <button type="button" class="telegram-button" onclick={() => loadStatus()} disabled={Boolean(busy)}>
        <RefreshCw size={15} aria-hidden="true" />{$t('settings.telegram.checkConnection')}
      </button>
      {#if pending}
        <button type="button" class="telegram-button subtle" onclick={disconnect} disabled={Boolean(busy)}>{$t('settings.telegram.cancelLink')}</button>
      {/if}
    </div>
  {/if}

  {#if error}
    <div class="error-message" role="alert">
      <p>{error}</p>
      <button type="button" class="telegram-button" onclick={() => loadStatus()} disabled={Boolean(busy)}>{$t('settings.telegram.retry')}</button>
    </div>
  {:else if status && (!status.configured || !status.available)}
    <button type="button" class="telegram-button subtle" onclick={() => loadStatus()} disabled={Boolean(busy)}>
      <RefreshCw size={15} aria-hidden="true" />{$t('settings.telegram.refresh')}
    </button>
  {/if}
  <p class="feedback" role="status" aria-live="polite">{feedback}</p>
</div>

<style>
  .telegram-settings { color: var(--text); min-width: 0; padding-block: 0.25rem 0.5rem; }
  .telegram-heading, .telegram-title, .account, .actions { display: flex; align-items: center; gap: 0.65rem; }
  .telegram-heading { justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; }
  .telegram-title h3 { margin: 0; font-size: 1.125rem; font-weight: 650; }
  .telegram-title > :global(svg) { color: var(--ink-secondary); }
  .description { margin: 0.75rem 0 1rem; max-width: 64ch; line-height: 1.55; }
  .hint, .setup-hint { color: var(--ink-secondary); line-height: 1.55; font-size: 0.875rem; max-width: 65ch; }
  .setup-hint { padding: 0.85rem 1rem; background: var(--bg-2); border-radius: var(--radius-sm, 6px); }
  .connection-status { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.55rem; border: 1px solid var(--border); border-radius: var(--radius-sm, 6px); font-size: 0.75rem; font-weight: 650; background: var(--bg-2); color: var(--text); }
  .connection-status[data-tone='success'] { border-color: color-mix(in srgb, var(--ok) 55%, var(--border)); background: color-mix(in srgb, var(--ok) 10%, var(--bg-1)); }
  .account { font-weight: 600; overflow-wrap: anywhere; }
  .account > :global(svg) { flex-shrink: 0; }
  .actions { flex-wrap: wrap; margin-top: 1rem; }
  .telegram-button { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.6rem 0.9rem; min-height: 44px; max-width: 100%; border: 1px solid var(--border); border-radius: var(--radius-sm, 6px); background: var(--bg-1); color: var(--text); font: inherit; font-size: 0.875rem; font-weight: 600; line-height: 1.3; text-align: center; white-space: normal; text-decoration: none; cursor: pointer; }
  .telegram-button > :global(svg) { flex-shrink: 0; }
  .telegram-button:hover:not(:disabled) { background: var(--bg-2); border-color: var(--ink-secondary); }
  .telegram-button:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; }
  .telegram-button:disabled { opacity: 0.55; cursor: wait; }
  .telegram-button.primary { background: var(--brand); color: var(--on-brand, #fff); border-color: var(--brand); }
  .telegram-button.primary:hover:not(:disabled) { background: var(--brand-hover, var(--brand)); }
  .telegram-button.subtle { background: transparent; }
  .link-instructions { display: grid; grid-template-columns: 192px minmax(0, 1fr); gap: 1.5rem; align-items: center; margin-block: 1.25rem; }
  .telegram-qr { display: block; width: 192px; height: 192px; max-width: 100%; background: white; border-radius: 4px; }
  .link-copy h4 { margin: 0 0 0.5rem; font-size: 1rem; }
  .link-copy p { margin: 0.5rem 0 1rem; line-height: 1.55; }
  .link-copy .hint { margin-bottom: 0; font-variant-numeric: tabular-nums; }
  .error-message { margin-top: 1rem; border: 1px solid var(--error); border-radius: var(--radius-sm, 6px); padding: 0.85rem 1rem; background: color-mix(in srgb, var(--error) 6%, var(--bg-1)); }
  .error-message p { margin: 0 0 0.75rem; line-height: 1.5; }
  .feedback { min-height: 1.25rem; margin: 0.75rem 0 0; font-size: 0.875rem; color: var(--ink-secondary); }
  @media (max-width: 540px) {
    .link-instructions { grid-template-columns: minmax(0, 1fr); gap: 1rem; }
    .telegram-qr { width: 160px; height: 160px; }
    .actions { align-items: stretch; }
    .actions .telegram-button { flex: 1 1 145px; }
  }
</style>
