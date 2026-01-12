<script lang="ts">
  export type MaterialRow = {
    id: string;
    type: 'Acrylic' | 'Aluminium' | 'Plastic' | 'ACP' | 'Film' | 'Other';
    thicknessMM?: number;
    colorSystem?: 'RAL' | 'Pantone' | 'HEX' | 'None';
    colorCode?: string;
    qty?: number;
    dims?: { w?: number; h?: number };
    notes?: string;
  };
  
  export let rows: MaterialRow[] = [];
  export let onChange = (r: MaterialRow[]) => {};
  
  function add() {
    rows = [...rows, { id: crypto.randomUUID(), type: 'Acrylic', colorSystem: 'None', qty: 1 }];
    onChange(rows);
  }
  
  function rm(id: string) {
    rows = rows.filter(x => x.id !== id);
    onChange(rows);
  }
  
  function set(id: string, patch: Partial<MaterialRow>) {
    rows = rows.map(r => r.id === id ? { ...r, ...patch } : r);
    onChange(rows);
  }
  
  function handleTypeChange(id: string, e: Event) {
    const val = (e.target as HTMLSelectElement).value as MaterialRow['type'];
    set(id, { type: val });
  }
  
  function handleColorSystemChange(id: string, e: Event) {
    const val = (e.target as HTMLSelectElement).value as MaterialRow['colorSystem'];
    set(id, { colorSystem: val });
  }
  
  function handleThicknessChange(id: string, e: Event) {
    set(id, { thicknessMM: +(e.target as HTMLInputElement).value });
  }
  
  function handleColorCodeInput(id: string, e: Event) {
    set(id, { colorCode: (e.target as HTMLInputElement).value });
  }
  
  function handleQtyChange(id: string, e: Event) {
    set(id, { qty: +(e.target as HTMLInputElement).value });
  }
  
  function handleWidthChange(id: string, e: Event, currentDims: MaterialRow['dims']) {
    set(id, { dims: { ...(currentDims || {}), w: +(e.target as HTMLInputElement).value } });
  }
  
  function handleHeightChange(id: string, e: Event, currentDims: MaterialRow['dims']) {
    set(id, { dims: { ...(currentDims || {}), h: +(e.target as HTMLInputElement).value } });
  }
  
  function handleNotesChange(id: string, e: Event) {
    set(id, { notes: (e.target as HTMLInputElement).value });
  }
</script>

<div class="row materials-head">
  <h3>Materials</h3>
  <button class="tag" on:click={add}>Add material</button>
</div>

<table class="rf-table">
  <thead>
    <tr>
      <th>Type</th>
      <th>Thickness (mm)</th>
      <th>Color</th>
      <th>Code</th>
      <th>Qty</th>
      <th>W×H (mm)</th>
      <th>Notes</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    {#each rows as r (r.id)}
      <tr>
        <td>
          <select bind:value={r.type} on:change={(e) => handleTypeChange(r.id, e)}>
            <option>Acrylic</option>
            <option>Aluminium</option>
            <option>Plastic</option>
            <option>ACP</option>
            <option>Film</option>
            <option>Other</option>
          </select>
        </td>
        <td>
          <input 
            type="number" 
            min="0" 
            step="0.5" 
            bind:value={r.thicknessMM} 
            on:change={(e) => handleThicknessChange(r.id, e)}
          />
        </td>
        <td>
          <select bind:value={r.colorSystem} on:change={(e) => handleColorSystemChange(r.id, e)}>
            <option>None</option>
            <option>RAL</option>
            <option>Pantone</option>
            <option>HEX</option>
          </select>
        </td>
        <td>
          <input 
            placeholder={r.colorSystem === 'HEX' ? '#RRGGBB' : r.colorSystem === 'RAL' ? 'RAL 3020' : 'e.g., 186 C'}
            bind:value={r.colorCode} 
            on:input={(e) => handleColorCodeInput(r.id, e)}
          />
        </td>
        <td>
          <input 
            type="number" 
            min="1" 
            step="1" 
            bind:value={r.qty} 
            on:change={(e) => handleQtyChange(r.id, e)}
          />
        </td>
        <td class="row dims">
          <input
            type="number"
            min="0"
            step="1"
            placeholder="W"
            value={r.dims?.w}
            on:change={(e) => handleWidthChange(r.id, e, r.dims)}
          />
          <input
            type="number"
            min="0"
            step="1"
            placeholder="H"
            value={r.dims?.h}
            on:change={(e) => handleHeightChange(r.id, e, r.dims)}
          />
        </td>
        <td>
          <input 
            value={r.notes || ''} 
            on:change={(e) => handleNotesChange(r.id, e)}
          />
        </td>
        <td>
          <button class="icon warn" aria-label="Remove row" on:click={() => rm(r.id)}>✕</button>
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<!-- Color swatch preview (non-text contrast ≥3:1 handled by border token) -->
{#if rows.some(r => r.colorSystem === 'HEX' && r.colorCode?.match(/^#?[0-9a-fA-F]{6}$/))}
  <div class="row swatch-row">
    {#each rows.filter(r => r.colorSystem === 'HEX' && r.colorCode?.match(/^#?[0-9a-fA-F]{6}$/)) as r}
      <div class="chip" style={`--chip:${r.colorCode?.startsWith('#') ? r.colorCode : '#' + r.colorCode}`}>
        <span class="dot" aria-hidden="true"></span><span>{r.colorCode}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
.materials-head {
  justify-content: space-between;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-sm);
}

select,
input {
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font: inherit;
  min-height: var(--control-sm);
  padding: 0 var(--space-sm);
  color: var(--text);
  inline-size: 100%;
}

.dims {
  gap: var(--space-xs);
}

.dims input {
  inline-size: calc(90px * var(--font-scale, 1));
  min-inline-size: calc(7ch + var(--space-sm));
}

.chip {
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  padding: var(--space-xs) var(--space-snug);
}

.swatch-row {
  flex-wrap: wrap;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
}

.dot {
  width: calc(14px * var(--font-scale, 1));
  height: calc(14px * var(--font-scale, 1));
  border-radius: 50%;
  background: var(--chip);
  outline: 1px solid var(--border);
}
.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-inline-size: var(--control-xs);
  min-block-size: var(--control-xs);
  padding: var(--space-xs);
  border-radius: calc(var(--radius-sm) - var(--space-xxs));
  border: 1px solid var(--border);
  background: var(--bg-0);
  color: var(--text);
  cursor: pointer;
  text-decoration: none;
}
.icon:hover {
  background: var(--bg-2);
}
.icon.warn {
  color: var(--danger);
  border-color: var(--danger);
}
</style>
