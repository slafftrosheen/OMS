import { items, movements, recordMovement, getItem } from '$lib/inventory/store';
import type { Movement } from '$lib/inventory/types';
import type { Order } from './types';
import { get } from 'svelte/store';

/**
 * Consume materials for an order
 * Records stock movements for materials used
 */
export async function consumeMaterialsForOrder(order: Order, username: string): Promise<void> {
  if (!order.materials || order.materials.length === 0) return;
  
  for (const mat of order.materials) {
    if (!mat.value) continue;
    
    // Extract quantity and material ID (format: "materialId:colorId:quantity")
    const parts = mat.value.split(':');
    
    if (parts.length >= 2) {
      const [materialId, quantityStr] = parts;
      const quantity = parseFloat(quantityStr);
      
      if (!materialId || !quantity || isNaN(quantity)) continue;
      
      await recordMovement(materialId, 'OUT', quantity, {
        by: username,
        refPO: order.id,
        note: `Used for order ${order.id} - ${order.title}`
      });
    }
  }
}

/**
 * Get all materials used for a specific order
 */
export function getMaterialsForOrder(orderId: string): Movement[] {
  return get(movements).filter(m => m.refPO === orderId);
}

/**
 * Check if all required materials are available in stock
 */
export function checkMaterialAvailability(order: Order): boolean {
  if (!order.materials || order.materials.length === 0) return true;
  
  for (const mat of order.materials) {
    if (!mat.value) continue;
    
    const parts = mat.value.split(':');
    if (parts.length >= 2) {
      const [materialId, quantityStr] = parts;
      const requiredQty = parseFloat(quantityStr);
      
      if (isNaN(requiredQty)) continue;
      
      const item = getItem(materialId);
      if (!item || item.stock < requiredQty) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Get material usage summary for an order
 */
export function getOrderMaterialSummary(orderId: string): {
  totalMaterials: number;
  totalCost: number;
  movements: Movement[];
} {
  const orderMovements = getMaterialsForOrder(orderId);
  const allItems = get(items);
  
  let totalCost = 0;
  orderMovements.forEach(m => {
    const item = allItems.find(i => i.id === m.itemId);
    // Cost calculation would need price per unit from inventory
    // For now, just count materials
  });
  
  return {
    totalMaterials: orderMovements.length,
    totalCost,
    movements: orderMovements
  };
}
