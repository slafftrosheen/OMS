<script lang="ts">
  import { onMount } from 'svelte';
  import { ordersStore, activeOrders, blockedOrders } from '$lib/stores/orders';

  let searchQuery = '';
  let statusFilter = '';

  onMount(() => {
    ordersStore.load();
  });

  async function handleSearch() {
    await ordersStore.setFilters({ search: searchQuery });
  }

  async function handleStatusFilter() {
    await ordersStore.setFilters({ status: statusFilter || undefined });
  }

  async function handleCreateOrder() {
    try {
      await ordersStore.create({
        po_number: 'PO-' + Date.now(),
        title: 'New Order',
        client: 'Client Name',
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'draft',
        priority: 5
      });
      alert('Order created!');
    } catch (err) {
      alert('Error creating order');
    }
  }
</script>

<div class="orders-page">
  <header>
    <h1>Orders</h1>
    <button on:click={handleCreateOrder}>Create Order</button>
  </header>

  <div class="filters">
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Search orders..."
      on:change={handleSearch}
    />

    <select bind:value={statusFilter} on:change={handleStatusFilter}>
      <option value="">All Status</option>
      <option value="draft">Draft</option>
      <option value="active">Active</option>
      <option value="completed">Completed</option>
    </select>
  </div>

  {#if $ordersStore.loading}
    <p>Loading...</p>
  {:else if $ordersStore.error}
    <p class="error">{$ordersStore.error}</p>
  {:else}
    <div class="stats">
      <div class="stat">
        <span class="label">Total:</span>
        <span class="value">{$ordersStore.total}</span>
      </div>
      <div class="stat">
        <span class="label">Active:</span>
        <span class="value">{$activeOrders.length}</span>
      </div>
      <div class="stat">
        <span class="label">Blocked:</span>
        <span class="value">{$blockedOrders.length}</span>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>PO Number</th>
          <th>Title</th>
          <th>Client</th>
          <th>Due Date</th>
          <th>Progress</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each $ordersStore.items as order (order.id)}
          <tr>
            <td>{order.po_number}</td>
            <td>{order.title}</td>
            <td>{order.client}</td>
            <td>{order.due_date}</td>
            <td>
              <progress value={order.progress_percentage || 0} max="100" />
              {order.progress_percentage?.toFixed(0) || 0}%
            </td>
            <td>
              <span class="badge badge-{order.status}">{order.status}</span>
            </td>
            <td>
              <a href="/orders/{order.id}">View</a>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    <div class="pagination">
      <button
        on:click={() => ordersStore.prevPage()}
        disabled={$ordersStore.currentPage === 1}
      >
        Previous
      </button>
      <span>
        Page {$ordersStore.currentPage} of {Math.ceil($ordersStore.total / $ordersStore.pageSize)}
      </span>
      <button
        on:click={() => ordersStore.nextPage()}
        disabled={$ordersStore.currentPage >= Math.ceil($ordersStore.total / $ordersStore.pageSize)}
      >
        Next
      </button>
    </div>
  {/if}
</div>