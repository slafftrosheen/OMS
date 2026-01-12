import type { Order } from '$lib/order/types.signage';
import { STATIONS, STAGE_SEQUENCE } from '$lib/order/stages';

export function summarize(orders: Order[]) {
  const stageBuckets: Record<string, number> = {};
  const reworkCounts: Record<string, number> = {};
  for (const station of STATIONS) {
    for (const state of STAGE_SEQUENCE) {
      stageBuckets[`${station}:${state}`] = 0;
    }
    reworkCounts[station] = 0;
  }

  let blocked = 0;
  let completed = 0;
  let rd = 0;
  let reworks = 0;

  for (const order of orders) {
    if (order.isRD) rd += 1;
    const stages = order.stages ?? {};
    const cycles = order.cycles ?? [];

    let allCompleted = true;
    let hasBlocked = false;

    for (const station of STATIONS) {
      const state = stages[station] ?? 'NOT_STARTED';
      stageBuckets[`${station}:${state}`] += 1;
      if (state !== 'COMPLETED') {
        allCompleted = false;
      }
      if (state === 'BLOCKED') {
        hasBlocked = true;
      }
      const count = cycles.filter((cycle) => cycle.station === station).length;
      reworkCounts[station] += count;
      reworks += count;
    }

    if (allCompleted) completed += 1;
    if (hasBlocked) blocked += 1;
  }

  return {
    stageBuckets,
    reworkCounts,
    blocked,
    completed,
    rd,
    reworks,
    total: orders.length
  };
}
