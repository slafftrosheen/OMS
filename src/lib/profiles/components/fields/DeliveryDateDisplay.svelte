<!-- src/lib/profiles/components/fields/DeliveryDateDisplay.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let date: string = ''; // ISO date string
  export let label: string = 'DELIVERY';
  export let readonly: boolean = false;
  
  const dispatch = createEventDispatcher();
  
  let dateInput: HTMLInputElement;
  
  $: parsedDate = date ? new Date(date) : null;
  
  $: monthDay = parsedDate 
    ? parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '— —';
  
  $: year = parsedDate 
    ? parsedDate.getFullYear().toString()
    : '—';
  
  function handleDateChange(e: Event) {
    const input = e.target as HTMLInputElement;
    date = input.value;
    dispatch('change', date);
  }
  
  function openDatePicker() {
    if (!readonly && dateInput) {
      // Try showPicker() first (modern browsers), fallback to click/focus
      if (typeof dateInput.showPicker === 'function') {
        try {
          dateInput.showPicker();
        } catch {
          dateInput.focus();
          dateInput.click();
        }
      } else {
        dateInput.focus();
        dateInput.click();
      }
    }
  }
</script>

<div class="delivery-date">
  <div class="date-display" on:click={openDatePicker} on:keydown={(e) => e.key === 'Enter' && openDatePicker()} role="button" tabindex="0" class:readonly>
    <div class="month-day">{monthDay}</div>
    <div class="divider">/</div>
    <div class="year">{year}</div>
  </div>
  
  {#if !readonly}
    <input
      type="date"
      bind:this={dateInput}
      class="hidden-input"
      value={date}
      on:change={handleDateChange}
    />
  {/if}
</div>

<style>
  .delivery-date {
    display: flex;
    flex-direction: column;
    gap: 4px;
    position: relative;
  }
  
  .date-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 8px 12px;
    background: #fff;
    border: 2px solid #000;
    border-radius: 3px;
    min-height: 60px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  
  .date-display:hover:not(.readonly) {
    background: #f5f5f5;
  }
  
  .date-display.readonly {
    cursor: default;
  }
  
  .month-day {
    font-size: 18px;
    font-weight: 700;
    color: #000;
    line-height: 1.2;
  }
  
  .divider {
    font-size: 12px;
    color: #666;
    margin: 2px 0;
  }
  
  .year {
    font-size: 16px;
    font-weight: 600;
    color: #333;
    line-height: 1.2;
  }
  
  .hidden-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    pointer-events: none;
  }
</style>
