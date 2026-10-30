<script lang="ts">
  import { locale } from 'svelte-i18n';
  import Dropdown from '../../src/lib/profiles/components/fields/Dropdown.svelte';
  import ToggleSwitch from '../../src/lib/profiles/components/fields/ToggleSwitch.svelte';
  import ThicknessSelector from '../../src/lib/profiles/components/fields/ThicknessSelector.svelte';
  import DimensionInput from '../../src/lib/profiles/components/fields/DimensionInput.svelte';
  import MaterialSelector from '../../src/lib/profiles/components/fields/MaterialSelector.svelte';
  import ButtonGroup from '../../src/lib/profiles/components/fields/ButtonGroup.svelte';
  import MultiSelectChips from '../../src/lib/profiles/components/fields/MultiSelectChips.svelte';
  import ColorRAL from '../../src/lib/profiles/components/fields/ColorRAL.svelte';
  import CompactColorPicker from '../../src/lib/profiles/components/fields/CompactColorPicker.svelte';
  import OracalSelector from '../../src/lib/profiles/components/fields/OracalSelector.svelte';
  import SignTrimSelector from '../../src/lib/profiles/components/fields/SignTrimSelector.svelte';
  import OracalCodeStack from '../../src/lib/profiles/components/fields/OracalCodeStack.svelte';
  import InventoryColorPicker from '../../src/lib/inventory/ColorPicker.svelte';
  import type { ColorSpec } from '../../src/lib/inventory/material-types';
  import OrderDimension from '../../src/lib/order/form-elements/DimensionInput.svelte';
  import OrderMaterial from '../../src/lib/order/form-elements/MaterialSelector.svelte';
  import ColorSwatches from '../../src/lib/order/form-elements/ColorSwatchSelector.svelte';
  import ProfileSelector from '../../src/lib/orders/components/ProfileSelector.svelte';
  import ChangeRequestList from '../../src/lib/order/ChangeRequestList.svelte';

  let disabled = $state(false);
  let submissions = $state(0);
  let direction = $state('Left');
  let modules = $state('Warm,Cool');
  let mounts = $state(['Bolts']);
  let ral = $state('9010');
  let compact = $state({ system: 'RAL', code: '9010', hex: '#F1EDE1' });
  let film = $state('031');
  let trim = $state('111');
  let codes = $state(['8500-031']);
  let material = $state('TEST_ALU');
  let selectedRequest = $state<string | null>('request-one');
  let inventoryColor = $state<ColorSpec | null>(null);

  function resetSelections() {
    direction = ''; modules = ''; mounts = []; ral = '';
    compact = { system: '', code: '', hex: '' };
    film = ''; trim = ''; material = ''; codes = ['8500-070'];
    selectedRequest = null;
  }
</script>

<main>
  <h1>Profile field behavior fixture</h1>
  <div class="fixture-controls">
    <label>Language
      <select onchange={event => locale.set(event.currentTarget.value)}>
        <option value="en">English</option><option value="ru">Русский</option><option value="lv">Latviešu</option>
      </select>
    </label>
    <button type="button" onclick={resetSelections}>Reset external selections</button>
    <button type="button" onclick={() => disabled = !disabled}>Toggle disabled controls</button>
  </div>

  <form onsubmit={event => { event.preventDefault(); submissions += 1; }}>
    <section aria-label="Field labels" class="field-grid">
      <Dropdown label="Finish" options={['Matte', 'Gloss']} value="Matte" {disabled} />
      <Dropdown label="Finish" options={['Matte', 'Gloss']} value="Gloss" {disabled} />
      <ToggleSwitch label="Illuminated" {disabled} />
      <ThicknessSelector label="Panel thickness" value={3} {disabled} />
      <DimensionInput label="Panel dimensions" value={{ width: 10, height: 20 }} {disabled} />
      <OrderDimension label="Return depth" value="50" />
      <OrderMaterial label="Back material" options={['Aluminum', 'PVC']} value="Aluminum" />
      <MaterialSelector label="Catalog material" bind:value={material} checkInventory={false} {disabled} />
      <ProfileSelector {disabled} />
    </section>

    <section aria-label="Compact colors">
      <CompactColorPicker label="Surface" value={compact} readonly={disabled} onchange={value => compact = value} />
      <output data-testid="compact-value">{JSON.stringify(compact)}</output>
    </section>

    <section aria-label="RAL colors">
      <ColorRAL label="Coating" bind:value={ral} {disabled} />
      <output data-testid="ral-value">{ral}</output>
    </section>

    <section aria-label="Selection groups" class="field-grid">
      <ButtonGroup label="Direction" options={['Left', 'Right']} bind:value={direction} {disabled} />
      <ButtonGroup label="Light modules" options={['Warm', 'Cool']} multiSelect bind:value={modules} {disabled} />
      <MultiSelectChips label="Mounts" options={['Bolts', 'Tape']} bind:value={mounts} {disabled} />
      <ColorSwatches label="Order color" colors={[{ code: 'red', hex: '#ff0000' }]} allowCustom />
      <SignTrimSelector label="Trim color" bind:value={trim}
        colors={{ '111': { name: 'First trim', hex: '#336699' }, '222': { name: 'Second trim', hex: '#ffffff' } }} {disabled} />
      <OracalCodeStack label="Film codes" {codes} readonly={disabled} onchange={value => codes = value} />
    </section>

    <section aria-label="ORACAL colors">
      <OracalSelector label="Film color" bind:value={film} {disabled} />
    </section>

    <section aria-label="Change request selection">
      <ChangeRequestList items={[{ id: 'request-one', title: 'First request', author: 'Fixture', status: 'pending' }]}
        selectedId={selectedRequest} onselectedId={value => selectedRequest = value} />
    </section>

    <section aria-label="Inventory color entry">
      <InventoryColorPicker onChange={value => inventoryColor = value} />
      <output data-testid="inventory-value">{JSON.stringify(inventoryColor)}</output>
    </section>
  </form>
  <output data-testid="submission-count">{submissions}</output>
</main>

<style>
  main { max-width: 1100px; margin: auto; padding: 16px; }
  h1 { font-size: 20px; }
  form { display: grid; gap: 24px; }
  section { min-width: 0; padding: 16px; border: 1px solid var(--border); border-radius: 8px; }
  .field-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
  .fixture-controls { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
  .fixture-controls label { display: grid; gap: 4px; }
  output { display: block; overflow-wrap: anywhere; font-size: 12px; margin-top: 8px; }
</style>
