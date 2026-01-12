<script lang="ts">
  export let label: string;
  export let variant: 'white' | 'black' | 'red' | 'orange' = 'white';
  export let active: boolean = false;
  export let onClick: () => void = () => {};
</script>

<button
  class="section-btn"
  class:white={variant === 'white'}
  class:black={variant === 'black'}
  class:red={variant === 'red'}
  class:orange={variant === 'orange'}
  class:active
  on:click={onClick}
  type="button"
>
  {label}
</button>

<style>
  .section-btn {
    padding: 6px 12px;
    border-radius: 3px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .section-btn.white {
    background: white;
    color: black;
    border: 1px solid #E5E5E5;
  }

  .section-btn.white:hover {
    background: #F5F5F5;
  }

  .section-btn.black {
    background: #000000;
    color: white;
    border: 1px solid #000000;
  }

  .section-btn.black:hover {
    background: #333333;
  }

  .section-btn.red {
    background: #FF0000;
    color: white;
    border: 1px solid #FF0000;
  }

  .section-btn.red:hover {
    background: #CC0000;
  }

  .section-btn.orange {
    background: #FF9900;
    color: black;
    border: 1px solid #FF9900;
    font-weight: bold;
  }

  .section-btn.orange:hover {
    background: #E68A00;
  }

  .section-btn.active {
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.3);
  }
</style>
