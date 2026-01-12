<script>
  import Kanban from '$lib/ui/Kanban.svelte';
  import { t } from 'svelte-i18n';
  const lanes = [
    { name: 'CAD', items: [{ id: 'PO-35818', title: 'PO-35818 – AH Lightbox Prototype' }] },
    { name: 'CNC', items: [{ id: 'PO-250375', title: 'PO-250375 – Long Frame' }] },
    { name: 'Paint', items: [{ id: 'PO-4894', title: 'PO-4894 – Bibliotheek 6300mm' }] },
    { name: 'Assembly', items: [{ id: 'PO-251076', title: 'PO-251076 – Wassink Lightbox' }] },
    { name: 'Logistics', items: [{ id: 'SE-COLOURCENTER-P7', title: 'SE-COLOURCENTER-P7 – Street Food P-7' }] }
  ];
</script>

<section class="card">
  <h2 style="margin-top:0">{$t('nav.kanban')}</h2>
  <Kanban {lanes} />
</section>
