<script lang="ts">
  import { locale, t } from 'svelte-i18n';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  import { getMaterialSpecificationFacts, MATERIAL_SPECIFICATION_LABELS, type MaterialSpecificationSource } from './catalog-presentation';
  import { projectCatalogEvidence } from './catalog-evidence';
  import { getLemonaSourceUrl } from './catalog-metadata';

  let { material }: { material: MaterialSpecificationSource & { code?: string; name_en?: string } } = $props();
  const componentId = $props.id();
  const headingId = `${componentId}-catalog-title`;
  let facts = $derived(getMaterialSpecificationFacts(material));
  let evidence = $derived(projectCatalogEvidence(material));
  let source = $derived(getLemonaSourceUrl(evidence.specifications.source_url));
  let manufacturerSource = $derived(typeof evidence.specifications.manufacturer_source_url === 'string'
    ? evidence.specifications.manufacturer_source_url : null);
  let brand = $derived(typeof evidence.specifications.brand === 'string' ? evidence.specifications.brand : '');
  let model = $derived(typeof evidence.specifications.model === 'string' ? evidence.specifications.model : '');
  let notes = $derived(typeof evidence.specifications.data_notes === 'string' ? evidence.specifications.data_notes : '');
  let sourceDate = $derived.by(() => {
    const value = evidence.specifications.verified_at;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
    return new Intl.DateTimeFormat($locale || 'en', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
  });
  let hasDetails = $derived(!!brand || !!source || !!manufacturerSource || facts.some(fact => fact.key !== 'unit'));
</script>

{#if hasDetails}
  <section class="catalog-specification-card" aria-labelledby={headingId}>
    <header>
      <div><h2 id={headingId}>{$t('catalogDetails.title')}</h2>
        {#if brand || model}<p class="identity">{brand}{#if brand && model}<span aria-hidden="true">{' · '}</span>{/if}{model}</p>{/if}
      </div>
      {#if evidence.code}<code class="product-code" title={$t('catalogDetails.code')}>{evidence.code}</code>{/if}
    </header>
    {#if facts.length}
      <dl class="specification-grid">
        {#each facts as fact (fact.key)}
          <div><dt>{$t(`materialSpecifications.${fact.key}`, { default: MATERIAL_SPECIFICATION_LABELS[fact.key] })}</dt><dd>{fact.value}</dd></div>
        {/each}
      </dl>
    {/if}
    {#if notes}<p class="data-notes">{notes}</p>{/if}
    {#if source || manufacturerSource || sourceDate}
      <footer>
        <div class="source-links">
          {#if source}<a href={source} target="_blank" rel="noopener noreferrer">{$t('catalogDetails.supplierSource')}<ExternalLink size={14} aria-hidden="true" /></a>{/if}
          {#if manufacturerSource}<a href={manufacturerSource} target="_blank" rel="noopener noreferrer">{$t('catalogDetails.manufacturerSource')}<ExternalLink size={14} aria-hidden="true" /></a>{/if}
        </div>
        {#if sourceDate}<span>{$t('catalogDetails.sourceChecked', { date: sourceDate })}</span>{/if}
      </footer>
    {/if}
  </section>
{/if}

<style>
  .catalog-specification-card { min-width:0;padding:var(--space-xl,24px);border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--bg-1);color:var(--ink-primary,var(--text)); }
  header { display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px; }
  header>div { min-width:0; }
  h2 { margin:0;font-size:var(--step-1,18px);font-weight:600; }
  .identity { margin:6px 0 0;font-size:14px;line-height:1.5;overflow-wrap:anywhere; }
  .product-code { max-width:100%;font-size:12px;background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 9px;overflow-wrap:anywhere; }
  .specification-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 24px;margin:0; }
  .specification-grid>div { min-width:0; }
  dt { font-size:12px;line-height:1.4;color:var(--ink-secondary,var(--muted)); }
  dd { margin:4px 0 0;font-size:14px;line-height:1.5;font-variant-numeric:tabular-nums;overflow-wrap:anywhere; }
  .data-notes { font-size:12px;line-height:1.6;margin:18px 0 0;padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-0);overflow-wrap:anywhere; }
  footer { display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:20px;padding-top:14px;border-top:1px solid var(--border);color:var(--ink-secondary,var(--muted));font-size:12px; }
  .source-links { display:flex;gap:8px 18px;flex-wrap:wrap; }
  a { display:inline-flex;align-items:center;gap:6px;min-height:32px;color:var(--ink-primary,var(--text));text-decoration:underline;text-underline-offset:3px; }
  a:focus-visible { outline:2px solid var(--focus);outline-offset:3px; }
  a:hover { color:var(--brand); }
  @media(max-width:480px) { .catalog-specification-card { padding:18px; } .specification-grid { gap:14px 16px; } }
  @media(max-width:350px) { .specification-grid { grid-template-columns:1fr; } }
</style>
