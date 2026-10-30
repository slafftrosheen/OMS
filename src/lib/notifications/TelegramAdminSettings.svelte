<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { t, locale } from 'svelte-i18n';
  import { base } from '$app/paths';
  import { DEFAULT_TELEGRAM_OPTIONS, TELEGRAM_COMMANDS, TELEGRAM_CATEGORIES, type TelegramOptions, type TelegramAdminStatus, type TelegramCommandName } from './telegram-options';
  import { telegramReceiverCopy } from './telegram-receiver-copy';

  let status = $state<TelegramAdminStatus | null>(null);
  let options = $state<TelegramOptions>(structuredClone(DEFAULT_TELEGRAM_OPTIONS));
  let botToken = $state('');
  let webhookSecret = $state('');
  let deliverySecret = $state('');
  let reveal = $state(false);
  let loading = $state(true);
  let busy = $state('');
  let error = $state('');
  let message = $state('');
  let baseline = $state('');
  let probe = $state<any>(null);
  let controller: AbortController | null = null;
  let alive = true;
  const prefix = 'settings.telegramAdmin.';
  const numericFields = [
    { key: 'batchSize', min: 1, max: 10 }, { key: 'concurrency', min: 1, max: 2 },
    { key: 'maxAttempts', min: 1, max: 5 }, { key: 'retryBaseSeconds', min: 10, max: 300 },
    { key: 'deliveryIntervalSeconds', min: 10, max: 300 }
  ] as const;
  let dirty = $derived(JSON.stringify(options) !== baseline || !!botToken || !!webhookSecret || !!deliverySecret);
  let disabled = $derived(!!busy || !status?.available);
  let copy = $derived(telegramReceiverCopy($locale));
  let polling = $derived(options.connectionMode === 'polling');

  async function request(method = 'GET', body?: unknown, timeoutMs = 20000) {
    controller?.abort(); const activeController = new AbortController(); controller = activeController;
    const timer = setTimeout(() => activeController.abort(), timeoutMs);
    try {
      const response = await fetch(`${base}/api/settings/telegram`, { method, cache: 'no-store', signal: activeController.signal,
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.code || 'requestFailed');
      return data;
    } finally { clearTimeout(timer); }
  }
  function showError(cause: unknown) {
    const code = cause instanceof Error ? cause.message : '';
    if (code === 'migration_required') { error = copy.migration; return; }
    if (code === 'receiver_conflict') { error = copy.receiverBusy; return; }
    if (code === 'runtime_changed') { error = copy.changed; return; }
    if (code === 'incomplete_settings' && polling) { error = copy.incomplete; return; }
    const known = ['invalid_settings', 'incomplete_settings', 'settings_unavailable', 'provider_unavailable', 'rd_required', 'not_configured'];
    error = $t(prefix + (known.includes(code) ? `errors.${code}` : 'requestFailed'));
  }
  function applyStatus(data: TelegramAdminStatus) {
    status = data;
    options = structuredClone({ ...DEFAULT_TELEGRAM_OPTIONS, ...data.options });
    baseline = JSON.stringify(options);
  }
  async function load() {
    if (busy) return;
    loading = true; error = '';
    try { const data = await request(); if (alive) applyStatus(data); }
    catch (cause) { if (alive) showError(cause); }
    finally { if (alive) loading = false; }
  }
  async function refreshReceiver() {
    if (busy || loading) return;
    busy = 'receiverStatus'; error = '';
    try {
      const data = await request('POST', { action: 'receiverStatus' });
      // Health updates never replace options or discard an administrator's unsaved edits.
      if (alive && status) status.receiver = data.receiver;
    } catch (cause) { if (alive) showError(cause); }
    finally { if (alive) busy = ''; }
  }
  async function save() {
    if (disabled) return;
    busy = 'save'; error = ''; message = ''; probe = null;
    try {
      const data = await request('PUT', { options, ...(botToken ? { botToken } : {}), ...(webhookSecret ? { webhookSecret } : {}), ...(deliverySecret ? { deliverySecret } : {}) });
      if (!alive) return;
      botToken = ''; webhookSecret = ''; deliverySecret = ''; reveal = false;
      applyStatus(data); message = $t(prefix + 'saved');
    } catch (cause) { if (alive) showError(cause); }
    finally { if (alive) busy = ''; }
  }
  async function run(action: string) {
    if (disabled || dirty) return;
    if (action === 'removeWebhook' && !confirm($t(prefix + 'removeWebhookConfirm'))) return;
    if (action === 'dispatch' && !confirm($t(prefix + 'dispatchConfirm'))) return;
    if (action === 'retryFailures' && !confirm($t(prefix + 'retryFailuresConfirm'))) return;
    busy = action; error = ''; message = '';
    try {
      const data = await request('POST', { action }, 55000);
      if (!alive) return;
      if (action === 'probe') { probe = data; if (status && data.receiver) status.receiver = data.receiver; }
      message = $t(prefix + (data.commandsSynced === false ? 'commandsPartial' : `results.${action}`), { count: data.requeued ?? 0 });
      if (action === 'dispatch' || action === 'retryFailures') {
        const refreshed = await request();
        if (alive) applyStatus(refreshed);
      }
    } catch (cause) { if (alive) showError(cause); }
    finally { if (alive) busy = ''; }
  }
  async function remove() {
    if (disabled || !confirm($t(prefix + 'removeConfirm'))) return;
    busy = 'remove'; error = ''; message = ''; probe = null;
    try {
      await request('DELETE');
      const data = await request();
      if (!alive) return;
      botToken = ''; webhookSecret = ''; deliverySecret = ''; reveal = false;
      applyStatus(data); message = $t(prefix + 'removed');
    } catch (cause) { if (alive) showError(cause); }
    finally { if (alive) busy = ''; }
  }
  function generateSecret(kind: 'webhookSecret' | 'deliverySecret') {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const value = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    if (kind === 'webhookSecret') webhookSecret = value; else deliverySecret = value;
  }
  function toggleCommand(command: TelegramCommandName, checked: boolean) {
    options.commands = checked ? [...options.commands, command] : options.commands.filter(value => value !== command);
  }
  function toggleCategory(category: typeof TELEGRAM_CATEGORIES[number], checked: boolean) {
    options.notificationCategories = checked ? [...options.notificationCategories, category] : options.notificationCategories.filter(value => value !== category);
  }
  function healthError(code: string) { return copy.errors[code as keyof typeof copy.errors] ?? copy.migration; }
  onMount(() => { void load(); });
  onDestroy(() => { alive = false; controller?.abort(); botToken = ''; webhookSecret = ''; deliverySecret = ''; });
</script>

<div class="telegram-admin" aria-busy={loading || !!busy}>
  <div class="admin-heading">
    <div><h2>{$t(prefix + 'title')}</h2><p>{$t(prefix + 'description')}</p></div>
    {#if status}<span class:active={status.options.enabled && status.configured} class="integration-state">{$t(prefix + (status.options.enabled && status.configured ? 'enabled' : 'disabled'))}</span>{/if}
  </div>
  {#if loading}<p role="status">{$t(prefix + 'loading')}</p>{/if}
  {#if error}<p class="feedback error" role="alert">{error} <button type="button" onclick={load} disabled={!!busy}>{$t(prefix + 'reload')}</button></p>{/if}
  {#if message}<p class="feedback success" role="status">{message}</p>{/if}
  {#if status}
    {#if !status.available}<p class="feedback error" role="alert">{$t(prefix + 'migrationRequired')}</p>{/if}
    <dl class="integration-metrics">
      <div><dt>{$t(prefix + 'connected')}</dt><dd>{status.counts.connected}</dd></div>
      <div><dt>{$t(prefix + 'queued')}</dt><dd>{status.counts.pending}</dd></div>
      <div><dt>{$t(prefix + 'failed')}</dt><dd>{status.counts.failed}</dd></div>
    </dl>
    <section class="receiver-health" aria-labelledby="telegram-receiver-heading">
      <h3 id="telegram-receiver-heading">{copy.health}</h3>
      <p role="status">{copy.states[status.receiver?.state ?? 'unavailable']}</p>
      {#if !status.receiver?.available}<p class="muted">{copy.migration}</p>{/if}
      <dl class="endpoints">
        <div><dt>{copy.lastPoll}</dt><dd>{status.receiver?.lastPollAt || '—'}</dd></div>
        <div><dt>{copy.lastUpdate}</dt><dd>{status.receiver?.lastUpdateAt || '—'}</dd></div>
        {#if status.receiver?.retryAt}<div><dt>{copy.retryAt}</dt><dd>{status.receiver.retryAt}</dd></div>{/if}
      </dl>
      {#if status.receiver?.lastError}<p class="error" role="status">{healthError(status.receiver.lastError)}</p>{/if}
      <button type="button" disabled={!!busy || loading} onclick={refreshReceiver}>{copy.refresh}</button>
    </section>
    <form onsubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset disabled={disabled}>
        <legend>{$t(prefix + 'configuration')}</legend>
        <label class="toggle"><input type="checkbox" bind:checked={options.enabled} /><span><strong>{$t(prefix + 'enableBot')}</strong><small>{$t(prefix + 'enableHint')}</small></span></label>
        <label for="telegram-connection-mode">{copy.mode}<select id="telegram-connection-mode" bind:value={options.connectionMode}><option value="polling">{copy.polling}</option><option value="webhook">{copy.webhook}</option></select></label>
        <p class="muted">{polling ? copy.pollingHint : copy.webhookHint}</p>
        <div class="field-grid">
          <label for="telegram-bot-username">{$t(prefix + 'botUsername')}<input id="telegram-bot-username" autocomplete="off" spellcheck="false" bind:value={options.botUsername} placeholder="company_bot" maxlength="33" /></label>
          <label for="telegram-app-url">{polling ? copy.appUrl : $t(prefix + 'appUrl')}<input id="telegram-app-url" type="url" autocomplete="off" spellcheck="false" bind:value={options.appUrl} placeholder={polling ? 'http://oms:3000' : 'https://oms.example.com'} maxlength="500" /></label>
          <label for="telegram-timezone">{$t(prefix + 'timezone')}<input id="telegram-timezone" list="telegram-timezones" bind:value={options.timezone} maxlength="80" required /></label>
          <datalist id="telegram-timezones"><option value="Europe/Riga"></option><option value="Europe/Amsterdam"></option><option value="Europe/London"></option><option value="UTC"></option></datalist>
          {#if polling}<label for="telegram-poll-timeout">{copy.timeout}<input id="telegram-poll-timeout" type="number" min="10" max="50" step="1" required bind:value={options.pollingTimeoutSeconds} /></label>{/if}
        </div>
        {#if polling}<p class="muted">{copy.appUrlHint}</p><p class="muted">{copy.timeoutHint}</p>{/if}
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>{$t(prefix + 'credentials')}</legend>
        <p class="muted">{polling ? copy.secretHint : $t(prefix + 'credentialHint')}</p>
        <div class="secret-field"><label for="telegram-bot-token">{$t(prefix + 'botToken')} <small>{status.credentials.botToken.masked || $t(prefix + 'notSet')}</small></label><input id="telegram-bot-token" type={reveal ? 'text' : 'password'} autocomplete="new-password" spellcheck="false" maxlength="256" bind:value={botToken} placeholder={$t(prefix + 'keepSecret')} /></div>
        {#if !polling}<div class="secret-field"><label for="telegram-webhook-secret">{$t(prefix + 'webhookSecret')} <small>{status.credentials.webhookSecret.masked || $t(prefix + 'notSet')}</small></label><div class="secret-entry"><input id="telegram-webhook-secret" type={reveal ? 'text' : 'password'} autocomplete="new-password" spellcheck="false" maxlength="256" bind:value={webhookSecret} placeholder={$t(prefix + 'keepSecret')} /><button type="button" onclick={() => generateSecret('webhookSecret')}>{$t(prefix + 'generate')}</button></div></div>{/if}
        <div class="secret-field"><label for="telegram-delivery-secret">{$t(prefix + 'deliverySecret')} <small>{status.credentials.deliverySecret.masked || $t(prefix + 'notSet')}</small></label><div class="secret-entry"><input id="telegram-delivery-secret" type={reveal ? 'text' : 'password'} autocomplete="new-password" spellcheck="false" maxlength="256" bind:value={deliverySecret} placeholder={$t(prefix + 'keepSecret')} /><button type="button" onclick={() => generateSecret('deliverySecret')}>{$t(prefix + 'generate')}</button></div></div>
        <label class="toggle reveal"><input type="checkbox" bind:checked={reveal} /><span>{$t(prefix + 'revealSecrets')}</span></label>
        <p class="muted">{polling ? copy.rotationHint : $t(prefix + 'rotationHint')}</p>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>{$t(prefix + 'notifications')}</legend>
        <div class="choice-grid">{#each TELEGRAM_CATEGORIES as category}<label class="toggle"><input type="checkbox" checked={options.notificationCategories.includes(category)} onchange={(event) => toggleCategory(category, event.currentTarget.checked)} /><span>{$t(prefix + `categories.${category}`)}</span></label>{/each}</div>
        <p class="muted">{$t(prefix + 'categoriesHint')}</p>
        <label class="toggle"><input type="checkbox" bind:checked={options.automaticDelivery} /><span><strong>{$t(prefix + 'automaticDelivery')}</strong><small>{$t(prefix + 'automaticHint')}</small></span></label>
        <div class="field-grid numeric">{#each numericFields as field}<label for={`telegram-${field.key}`}>{$t(prefix + field.key)}<input id={`telegram-${field.key}`} type="number" min={field.min} max={field.max} step="1" required bind:value={options[field.key]} /></label>{/each}</div>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>{$t(prefix + 'bidirectional')}</legend>
        <label class="toggle"><input type="checkbox" bind:checked={options.commandsEnabled} /><span><strong>{$t(prefix + 'enableCommands')}</strong><small>{$t(prefix + 'commandsHint')}</small></span></label>
        <div class="choice-grid commands">{#each TELEGRAM_COMMANDS as command}<label class="toggle"><input type="checkbox" disabled={!options.commandsEnabled} checked={options.commands.includes(command)} onchange={(event) => toggleCommand(command, event.currentTarget.checked)} /><span><code>/{command}</code><small>{$t(prefix + `commands.${command}`)}</small></span></label>{/each}</div>
        <label class="toggle"><input type="checkbox" disabled={!options.commandsEnabled} bind:checked={options.aiEnabled} /><span><strong>{$t(prefix + 'aiEnabled')}</strong><small>{$t(prefix + 'aiHint')}</small></span></label>
        {#if options.aiEnabled}<label class="toggle"><input type="checkbox" disabled={!options.commandsEnabled} checked={options.commands.includes('ask')} onchange={(event) => toggleCommand('ask', event.currentTarget.checked)} /><span><code>/ask</code><small>{$t(prefix + 'commands.ask')}</small></span></label>{/if}
        <p class="muted">{$t(prefix + 'stopHint')}</p>
      </fieldset>
      <div class="save-row"><button class="primary" type="submit" disabled={disabled}>{$t(prefix + (busy === 'save' ? 'saving' : 'save'))}</button>{#if dirty}<span class="muted">{$t(prefix + 'unsaved')}</span>{/if}</div>
    </form>
    <section class="provider-actions" aria-labelledby="telegram-provider-actions">
      <h3 id="telegram-provider-actions">{$t(prefix + 'setup')}</h3>
      <p class="muted">{polling ? copy.setup : $t(prefix + 'setupHint')}</p>
      {#if !polling}<dl class="endpoints"><div><dt>{$t(prefix + 'webhookUrl')}</dt><dd><code>{status.webhookUrl || '—'}</code></dd></div><div><dt>{$t(prefix + 'dispatchUrl')}</dt><dd><code>{status.dispatchUrl || '—'}</code></dd></div></dl>{/if}
      <div class="actions">
        <button type="button" disabled={disabled || dirty || !status.credentials.botToken.configured} onclick={() => run('probe')}>{$t(prefix + 'probe')}</button>
        {#if !polling}<button type="button" disabled={disabled || dirty || !status.configured || !status.options.enabled} onclick={() => run('registerWebhook')}>{$t(prefix + 'registerWebhook')}</button>{/if}
        <button type="button" disabled={disabled || dirty || !status.configured} onclick={() => run('syncCommands')}>{$t(prefix + 'syncCommands')}</button>
        <button type="button" disabled={disabled || dirty || !status.options.enabled} onclick={() => run('dispatch')}>{$t(prefix + 'dispatch')}</button>
        <button type="button" disabled={disabled || dirty || !status.options.enabled || status.counts.failed === 0} onclick={() => run('retryFailures')}>{$t(prefix + 'retryFailures')}</button>
        {#if !polling}<button type="button" disabled={disabled || dirty || !status.credentials.botToken.configured} onclick={() => run('removeWebhook')}>{$t(prefix + 'removeWebhook')}</button>{/if}
      </div>
      {#if busy && busy !== 'save' && busy !== 'remove'}<p role="status">{$t(prefix + 'working')}</p>{/if}
      {#if probe}<div class="probe-result" role="status"><strong>@{probe.botUsername}</strong><p>{$t(prefix + (probe.botMatches ? 'botMatches' : 'botMismatch'))}</p>{#if probe.webhook}<p>{probe.connectionMode === 'polling' ? (probe.webhook.matches ? copy.webhookReady : copy.webhookBlocked) : $t(prefix + (probe.webhook.matches ? 'webhookMatches' : probe.webhook.registered ? 'webhookMismatch' : 'webhookMissing'))} · {$t(prefix + 'pendingUpdates')}: {probe.webhook.pending}</p>{#if probe.webhook.hasError}<p class="error">{$t(prefix + 'webhookError')}</p>{/if}{/if}</div>{/if}
      {#if !polling}<p class="muted">{$t(prefix + 'schedulerHint')}</p>{/if}
      <button class="danger" type="button" disabled={disabled} onclick={remove}>{$t(prefix + 'removeCredentials')}</button>
    </section>
  {/if}
</div>

<style>
  .telegram-admin { min-width:0; display:grid; gap:var(--space-md,16px); }
  .admin-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
  h2,h3,p { margin:0; } h2 { font-size:1.15rem; } h3 { font-size:1rem; }
  .admin-heading p,.muted,small { color:var(--ink-secondary); font-size:.85rem; line-height:1.5; }
  .admin-heading p { margin-top:6px; max-width:68ch; }
  .integration-state { border:1px solid var(--border); background:var(--bg-2); border-radius:999px; font-size:.75rem; padding:4px 9px; white-space:nowrap; }
  .integration-state.active { color:var(--ok); border-color:var(--ok); }
  .integration-metrics { display:flex; flex-wrap:wrap; gap:20px; margin:0; padding:12px 0; border-block:1px solid var(--border); }
  .integration-metrics dt { font-size:.8rem; color:var(--ink-secondary); } .integration-metrics dd { font-size:1.2rem; font-weight:650; margin:2px 0 0; }
  form { display:grid; gap:18px; } fieldset { border:1px solid var(--border); border-radius:var(--radius-md,8px); padding:16px; min-width:0; display:grid; gap:14px; margin:0; }
  legend { padding:0 6px; font-weight:650; font-size:.9rem; }
  .field-grid,.choice-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; } .numeric { grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); }
  label { display:grid; gap:6px; min-width:0; font-size:.875rem; } .toggle { display:flex; align-items:flex-start; gap:9px; cursor:pointer; }
  .toggle span { min-width:0; display:grid; gap:3px; } .toggle input { flex:0 0 17px; width:17px; min-width:17px; height:17px; padding:0; margin:3px 0 0; accent-color:var(--brand); }
  input:not([type=checkbox]),select { box-sizing:border-box; width:100%; min-width:0; min-height:42px; padding:9px 11px; background:var(--bg-1); color:var(--ink-primary); border:1px solid var(--border); border-radius:6px; font:inherit; }
  input:focus-visible,button:focus-visible,select:focus-visible { outline:2px solid var(--brand); outline-offset:2px; }
  .secret-field { display:grid; gap:6px; } .secret-field label { display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; }
  .secret-entry { display:flex; gap:8px; min-width:0; } .secret-entry input { flex:1 1 auto; } .secret-entry button { flex-shrink:0; }
  .reveal { font-size:.8rem; } button { min-height:44px; border:1px solid var(--border); border-radius:6px; padding:8px 12px; background:var(--bg-2); color:var(--ink-primary); font:inherit; font-size:.85rem; cursor:pointer; }
  button:hover:not(:disabled) { border-color:var(--brand); } button:disabled { opacity:.5; cursor:not-allowed; }
  button.primary { background:var(--brand); border-color:var(--brand); color:var(--on-brand); font-weight:650; }
  .save-row,.actions { display:flex; align-items:center; flex-wrap:wrap; gap:10px; } .save-row { position:sticky; bottom:0; background:var(--bg-1); padding-block:10px; z-index:1; }
  .provider-actions { display:grid; gap:12px; padding-top:16px; border-top:1px solid var(--border); }
  .receiver-health { display:grid; gap:10px; padding:14px; border:1px solid var(--border); border-radius:8px; }
  .receiver-health button { justify-self:start; }
  .endpoints { margin:0; display:grid; gap:10px; } .endpoints dt { font-size:.8rem; color:var(--ink-secondary); } .endpoints dd { margin:3px 0 0; overflow-wrap:anywhere; font-size:.8rem; }
  .feedback,.probe-result { padding:12px; border:1px solid var(--border); border-radius:6px; line-height:1.5; font-size:.875rem; overflow-wrap:anywhere; }
  .feedback.error { border-color:var(--error); } .error,.danger { color:var(--error); } .success { color:var(--ok); } .probe-result p { margin-top:4px; }
  .danger { justify-self:start; } .commands code { font-weight:650; }
  @media(max-width:600px) { .field-grid,.choice-grid { grid-template-columns:minmax(0,1fr); } .numeric { grid-template-columns:repeat(2,minmax(0,1fr)); } fieldset { padding:12px; } .admin-heading { flex-wrap:wrap; } .secret-entry { flex-wrap:wrap; } .secret-entry input { flex-basis:100%; } .actions button { flex:1 1 150px; } }
  @media(max-width:360px) { .numeric { grid-template-columns:minmax(0,1fr); } .integration-metrics { gap:12px; } }
</style>
