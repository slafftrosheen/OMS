<script lang="ts">
  import { locale } from 'svelte-i18n';
  import OrderNativeProfileForm from '../../src/lib/order/OrderNativeProfileForm.svelte';
  import MaterialThicknessSelect from '../../src/lib/components/MaterialThicknessSelect.svelte';

  const legacy = {
    profileName: 'TEST ONLY profile',
    signType: 'EXTERIOR',
    CNC_FREZER: { face: 'PLEXIGLAS_GS_0F00', faceThickness: '3mm', back: 'ALU_COMPOSITE_0A000', backThickness: '2' },
    BENDER: { sides: '', depth: 100 },
    ASSEMBLING: {
      led: true, ledModule: 'Lemlux LP-2835-120-24V LED strip 4000K', ledModuleShort: 'LED',
      psu: true, psuModel: 'Mean Well LRS-100-12 12V 102W', psuModelShort: 'PSU',
      cables: true, cableType: 'LAPP H05VV-F 3G0.75 white', cableTypeShort: 'CABLE',
      frame: true, frameMaterial: 'Aluminium tube 40x40', frameMaterialShort: 'ALU', frameDimensions: '40x40x2'
    }
  };
  let configuration = $state<Record<string, unknown>>(JSON.parse(JSON.stringify(legacy)));
  let latest = $state<Record<string, unknown>>(JSON.parse(JSON.stringify(legacy)));
  let instance = $state(0);
  let editable = $state(true);
  let changes = $state(0);
  let savedThickness = $state('3');
  let thicknessType = $state('ACRYLIC');
  let thicknessOptions = $state<number[] | undefined>(undefined);

  function reload() {
    configuration = JSON.parse(JSON.stringify(latest));
    instance += 1;
  }

  function loadLegacyMaterialRoles() {
    latest = {
      ...JSON.parse(JSON.stringify(legacy)),
      CNC_FREZER: { ...legacy.CNC_FREZER, back: 'Aluminium flat bar 20x3', backThickness: '3mm' },
      BENDER: { sides: 'Aluminium tube 40x40', sidesThickness: '2mm', depth: 100 },
      ASSEMBLING: { ...legacy.ASSEMBLING, cableType: 'TEST LIYCY 2x0.5 control cable', cablesLength: '6 m' }
    };
    changes = 0;
    reload();
  }
</script>

<main>
  <h1>Profile controls regression fixture</h1>
  <div class="fixture-controls">
    <label>Theme
      <select aria-label="Theme" onchange={event => document.documentElement.dataset.theme = event.currentTarget.value}>
        <option>LightVim</option><option>DarkVim</option><option>HighContrast</option>
      </select>
    </label>
    <label>Language
      <select aria-label="Language" onchange={event => locale.set(event.currentTarget.value)}>
        <option value="en">English</option><option value="ru">Русский</option><option value="lv">Latviešu</option>
      </select>
    </label>
    <button type="button" onclick={reload}>Reload serialized profile</button>
    <button type="button" onclick={() => editable = !editable}>Toggle read only</button>
    <button type="button" onclick={loadLegacyMaterialRoles}>Load legacy material roles</button>
  </div>

  <section aria-label="Native profile">
    {#key instance}
      <OrderNativeProfileForm {configuration} {editable} onChange={value => { latest = value; changes += 1; }} />
    {/key}
  </section>

  <section aria-label="Legacy thickness request" class="legacy-thickness">
    <MaterialThicknessSelect bind:value={savedThickness} materialType={thicknessType}
      {thicknessOptions} label="Standalone thickness" />
    <button type="button" onclick={() => thicknessType = 'PVC'}>Use PVC fallback</button>
    <button type="button" onclick={() => thicknessOptions = []}>Use explicit empty options</button>
    <output data-testid="standalone-thickness">{savedThickness}</output>
  </section>
  <output data-testid="change-count">{changes}</output>
  <output data-testid="configuration">{JSON.stringify(latest)}</output>
</main>

<style>
  main { padding: 16px; max-width: 1440px; margin: auto; }
  h1 { font-size: 20px; }
  .fixture-controls { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
  .fixture-controls label { display: grid; gap: 4px; }
  .fixture-controls button, .fixture-controls select { min-height: 44px; }
  .legacy-thickness { max-width: 320px; margin-top: 20px; }
  output { display: block; overflow-wrap: anywhere; font-size: 12px; }
</style>
