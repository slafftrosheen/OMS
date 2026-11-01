<script lang="ts">
  import { t, locale } from 'svelte-i18n';
  import { AlertTriangle, FileText, LockKeyhole, Maximize2, Trash2 } from 'lucide-svelte';
  import { profileNoteGroups } from './profile-attention';
  import { profileAttentionCopy } from './profile-attention-copy';
  import OrderNativeProfileForm from './OrderNativeProfileForm.svelte';
  import { hasNativeProfileConfiguration, profileSheetKey, savedProfileDetails, type OrderSheetProfile } from './order-sheet';

  let { profiles, editable = false, focusedProfileIndex = null, showTemplates = false,
    templates = [], templateError = '', onChange, onRemove, onFocusProfile }: {
    profiles: OrderSheetProfile[];
    editable?: boolean;
    focusedProfileIndex?: number | null;
    showTemplates?: boolean;
    templates?: { id: string; code: string; name: string }[];
    templateError?: string;
    onChange?: (index: number, profile: OrderSheetProfile) => void;
    onRemove?: (index: number) => void;
    onFocusProfile?: (index: number) => void;
  } = $props();
  const formId = $props.id();
  let copy = $derived(profileAttentionCopy($locale));
  let notedProfiles = $derived(profiles.map((profile, index) => ({
    index, name: displayProfileName(profile, index), groups: profileNoteGroups(profile)
  })).filter(profile => profile.groups.length > 0));

  function displayProfileName(profile: OrderSheetProfile, index: number): string {
    const name = profile.configuration?.profileName;
    return typeof name === 'string' && name.trim() ? name.trim()
      : $t('productionPacket.profileNumber', { values: { number: index + 1 } });
  }

  function focusSheetTarget(id: string) {
    // Local navigation must not change the URL or trigger the unsaved-draft guard.
    const target = document.getElementById(id);
    target?.scrollIntoView({ block: 'start', behavior: 'auto' });
    target?.focus({ preventScroll: true });
  }

  function change(index: number, patch: Partial<OrderSheetProfile>) {
    if (!editable || !profiles[index]) return;
    onChange?.(index, { ...profiles[index], ...patch });
  }
</script>

<section class="order-profile-sheet" aria-label={$t('orders.new.sections.profiles')}>
  <header class="profiles-heading">
    <h2><FileText size={18} aria-hidden="true" /> {$t('orders.new.sections.profiles')}</h2>
    <div class="sheet-heading-meta">
      {#if !editable && profiles.length > 0}<span class="sheet-readonly"><LockKeyhole size={14} aria-hidden="true" /> {copy.readOnly}</span>{/if}
      <span class="profile-count">{profiles.length}</span>
    </div>
  </header>
  {#if profiles.length > 1 && notedProfiles.length > 0}
    <details class="attention-index">
      <summary><span><AlertTriangle size={16} aria-hidden="true" /> {copy.index}: <strong>{notedProfiles.length}</strong></span></summary>
      <nav aria-label={copy.index}>
        {#each notedProfiles as item (item.index)}
          <button type="button" class="sheet-button attention-link"
            aria-label={`${copy.goToProfile}: ${item.name} · ${item.groups.map(group => copy.groups[group]).join(', ')}`}
            aria-controls={`${formId}-profile-title-${item.index}`}
            onclick={() => focusSheetTarget(`${formId}-profile-title-${item.index}`)}>
            <strong>#{item.index + 1} · {item.name}</strong>
            <span>{item.groups.map(group => copy.groups[group]).join(' · ')}</span>
          </button>
        {/each}
      </nav>
    </details>
  {/if}
  {#if profiles.length === 0}
    <p class="empty-profiles" role="status">{$t('productionPacket.noProfiles')}</p>
  {/if}
  {#each profiles as profile, index (profileSheetKey(profile, index))}
    {@const profileName = displayProfileName(profile, index)}
    {@const note = typeof profile.notes === 'string' ? profile.notes.trim() : ''}
    <article class="profile-card" data-order-profile={index}>
      <header class="profile-card-header">
        <div class="profile-title">
          <span class="profile-number">#{index + 1}</span>
          <h3 id={`${formId}-profile-title-${index}`} tabindex="-1">{profileName}</h3>
          {#if note}
            <button type="button" class="note-warning" onclick={() => focusSheetTarget(`${formId}-profile-note-${index}`)}>
              <AlertTriangle size={14} aria-hidden="true" /> {$t('orderSheet.note')}
            </button>
          {/if}
        </div>
        <div class="profile-actions">
          <label class="quantity-control">
            {$t('orderSheet.quantity')}
            <input type="number" min="1" max="1000" value={profile.quantity ?? profile.quantity1 ?? 1}
              aria-label={`${profileName} · ${$t('orderSheet.quantity')}`} disabled={!editable}
              oninput={event => change(index, { quantity: Number(event.currentTarget.value) })} />
          </label>
          {#if onFocusProfile}
            <button class="sheet-button icon-button" type="button" onclick={() => onFocusProfile?.(index)}
              aria-label={$t('orderAssistant.viewNativeProfile')} title={$t('orderAssistant.viewNativeProfile')}>
              <Maximize2 size={16} aria-hidden="true" />
            </button>
          {/if}
          {#if editable && onRemove}
            <button class="sheet-button icon-button" type="button" onclick={() => onRemove?.(index)}
              aria-label={`${$t('common.remove')} · ${profileName}`} title={$t('common.remove')}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          {/if}
        </div>
      </header>

      {#if showTemplates}
        <div class="profile-template">
          <label>{$t('productionReadiness.profileSelect')}
            <select disabled={!editable || !!templateError}
              value={profile.profileTemplateId ?? profile.profile_template_id ?? ''}
              onchange={event => change(index, { profileTemplateId: event.currentTarget.value || null, profile_template_id: event.currentTarget.value || null })}>
              <option value="">{$t('productionReadiness.profileUnassigned')}</option>
              {#each templates as option (option.id)}
                <option value={option.id}>{option.code} — {option.name}</option>
              {/each}
            </select>
          </label>
        </div>
      {/if}

      {#if focusedProfileIndex === index}
        <p class="profile-editing-status" role="status">{$t('orderSheet.focusedEditor')}</p>
      {:else if editable || hasNativeProfileConfiguration(profile.configuration)}
        <div class="visual-wrapper">
          <OrderNativeProfileForm configuration={profile.configuration ?? {}} {editable}
            onChange={configuration => change(index, { configuration })} />
        </div>
      {:else}
        <div class="legacy-profile">
          <p role="status">{$t('orderSheet.legacyProfile')}</p>
          {#if savedProfileDetails(profile.configuration).length}
            <dl>
              {#each savedProfileDetails(profile.configuration) as [label, value] (label)}
                <div><dt>{label}</dt><dd>{value}</dd></div>
              {/each}
            </dl>
          {/if}
        </div>
      {/if}

      {#if editable || [profile.quantity2, profile.quantity3, profile.quantity4].some(value => typeof value === 'number' && value !== 0)}
        <details class="extra-quantities" open={!editable}>
          <summary>{$t('productionPacket.quantities')}</summary>
          <div class="quantities-grid">
            {#each [2, 3, 4] as quantity}
              <label>{$t('orderSheet.quantityNumber', { values: { number: quantity } })}
                <input type="number" min="0" max="1000" value={Number(profile[`quantity${quantity}`] ?? 0)}
                  disabled={!editable}
                  oninput={event => change(index, { [`quantity${quantity}`]: Number(event.currentTarget.value) })} />
              </label>
            {/each}
          </div>
        </details>
      {/if}
      {#if editable || note}
        <div class="profile-note" id={`${formId}-profile-note-${index}`} tabindex="-1">
          {#if editable}
            <label>{$t('orderSheet.profileNotes')}
              <textarea value={profile.notes ?? ''} rows="2" maxlength="4000"
                oninput={event => change(index, { notes: event.currentTarget.value })}></textarea>
            </label>
          {:else}
            <p><AlertTriangle size={14} aria-hidden="true" /> <strong>{$t('orderSheet.profileNotes')}</strong></p>
            <p class="saved-note">{profile.notes}</p>
          {/if}
        </div>
      {/if}
    </article>
  {/each}
</section>

<style>
  .order-profile-sheet { display: grid; gap: var(--space-md); min-width: 0; }
  .profiles-heading, .profile-card-header, .profile-title, .profile-actions {
    display: flex; align-items: center; gap: var(--space-sm); min-width: 0;
  }
  .profiles-heading { justify-content: space-between; flex-wrap: wrap; }
  .profiles-heading h2 { display: flex; align-items: center; gap: var(--space-sm); margin: 0; font-size: var(--text-lg); }
  .sheet-heading-meta, .sheet-readonly { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-xs); }
  .sheet-readonly { color: var(--ink-secondary); font-size: var(--text-sm); }
  .attention-index { min-width: 0; border: 1px solid var(--warn); border-radius: var(--radius-sm); background: var(--warn-soft); color: var(--ink-primary); }
  .attention-index summary { padding: var(--space-sm) var(--space-md); cursor: pointer; overflow-wrap: anywhere; }
  .attention-index summary span { display: inline-flex; align-items: center; gap: var(--space-xs); flex-wrap: wrap; vertical-align: middle; }
  .attention-index nav { display: grid; gap: var(--space-xs); padding: 0 var(--space-sm) var(--space-sm); }
  .attention-link { justify-content: space-between; flex-wrap: wrap; text-align: start; overflow-wrap: anywhere; min-width: 0; }
  .attention-link span { font-size: var(--text-sm); }
  .profile-title h3, .profile-note { scroll-margin-top: calc(var(--control-size, 44px) + var(--space-lg, 24px)); }
  .profile-title h3:focus { outline: 2px solid var(--focus); outline-offset: 2px; }
  .profile-count, .profile-number { padding: var(--space-xs) var(--space-sm); border-radius: var(--radius-sm); background: var(--brand-soft); color: var(--brand); font-weight: 700; }
  .profile-card { min-width: 0; border: 1px solid var(--glass-border); border-radius: var(--radius-lg); background: var(--glass-bg-strong); box-shadow: var(--glass-shadow-sm); }
  .profile-card-header { justify-content: space-between; flex-wrap: wrap; padding: var(--space-md); border-bottom: 1px solid var(--border); }
  .profile-title { flex: 1 1 auto; flex-wrap: wrap; }
  .profile-title h3 { margin: 0; font-size: var(--text-md); overflow-wrap: anywhere; }
  .profile-actions { flex-wrap: wrap; }
  .quantity-control { display: flex; align-items: center; gap: var(--space-sm); font-size: var(--text-sm); }
  .quantity-control input { max-width: 6rem; }
  .visual-wrapper { min-width: 0; padding: var(--space-md); }
  .profile-template, .extra-quantities, .profile-note, .legacy-profile, .profile-editing-status { padding: var(--space-md); margin: 0; }
  .profile-template label, .profile-note label, .quantities-grid label { display: grid; gap: var(--space-xs); font-size: var(--text-sm); }
  .profile-template { max-width: 32rem; }
  .extra-quantities { border-top: 1px solid var(--border); }
  .extra-quantities summary { cursor: pointer; color: var(--ink-secondary); font-size: var(--text-sm); }
  .quantities-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-sm); margin-top: var(--space-sm); }
  input, textarea, select { box-sizing: border-box; width: 100%; min-width: 0; min-height: var(--control-sm); padding: var(--space-sm); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-1); color: var(--ink-primary); font: inherit; }
  :disabled { opacity: 1; -webkit-text-fill-color: var(--ink-primary); cursor: default; }
  .sheet-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-xs); min-height: var(--control-sm); padding: var(--space-xs) var(--space-sm); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-1); color: var(--ink-primary); cursor: pointer; }
  .icon-button { min-width: var(--control-sm); }
  button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, summary:focus-visible, .profile-note:focus { outline: 2px solid var(--focus); outline-offset: 2px; }
  .note-warning { display: inline-flex; align-items: center; gap: var(--space-xs); padding: var(--space-xs) var(--space-sm); color: var(--ink-primary); background: var(--warn-soft); border: 1px solid var(--warn); border-radius: var(--radius-sm); font-size: var(--text-sm); font-weight: 600; text-decoration: none; font-family: inherit; cursor: pointer; }
  .profile-note { border-top: 1px solid var(--border); }
  .profile-note p { margin: 0; display: flex; align-items: center; gap: var(--space-xs); }
  .profile-note .saved-note { display: block; margin-top: var(--space-sm); white-space: pre-wrap; overflow-wrap: anywhere; line-height: var(--leading-normal); }
  .empty-profiles, .profile-editing-status, .legacy-profile { color: var(--ink-secondary); }
  .legacy-profile dl { display: grid; gap: var(--space-sm); }
  .legacy-profile dt { font-weight: 600; }
  .legacy-profile dd { margin: var(--space-xs) 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  @media (max-width: 600px) {
    .profile-card-header, .visual-wrapper { padding: var(--space-sm); }
    .profile-actions { width: 100%; justify-content: flex-end; }
    .quantities-grid { grid-template-columns: minmax(0, 1fr); }
    .sheet-button { min-height: var(--control-size); min-width: var(--control-size); }
  }
</style>
