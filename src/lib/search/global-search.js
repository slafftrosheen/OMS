import { listOrders } from '$lib/order/signage-store';

/**
 * @typedef {Object} SearchHit
 * @property {string} id
 * @property {string} title
 * @property {string} client
 * @property {number} score
 * @property {string[]} where
 */

const TOKEN_SPLIT = /[\s\-_:/.]+/;

function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(TOKEN_SPLIT)
    .filter(Boolean);
}

function haystack(order) {
  const parts = [order.id, order.title, order.client];
  for (const field of order.fields ?? []) {
    parts.push(`${field.label}:${field.value}`);
  }
  for (const material of order.materials ?? []) {
    parts.push(`${material.label}:${material.value}`);
  }
  return parts.join(' ').toLowerCase();
}

/**
 * @param {string} query
 * @param {readonly any[]=} overrideOrders optional pre-fetched orders (test helper)
 * @returns {SearchHit[]}
 */
export function searchOrders(query, overrideOrders) {
  const q = tokenize(query);
  if (!q.length) return [];

  const orders = Array.isArray(overrideOrders) ? overrideOrders : listOrders();
  const hits = [];

  for (const order of orders) {
    const hay = haystack(order);
    const matched = q.filter((token) => hay.includes(token));
    if (!matched.length) continue;

    const uniqueMatches = Array.from(new Set(matched));

    hits.push({
      id: order.id,
      title: order.title,
      client: order.client,
      score: uniqueMatches.length / q.length,
      where: uniqueMatches
    });
  }

  return hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title);
  });
}

export function __test__tokenize(input) {
  return tokenize(input);
}
