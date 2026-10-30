/** These suggestions only open existing panels after a user click. They do not
 * grant permission or execute an order, stock, file or canvas mutation. */
export const ASSISTANT_WORKFLOW_IDS = ['prepare', 'discuss', 'intake', 'readiness', 'canvas', 'review'] as const;
export type AssistantWorkflowId = typeof ASSISTANT_WORKFLOW_IDS[number];
export interface AssistantWorkflow { id: AssistantWorkflowId; label: string }
export const SUGGEST_WORKFLOW_TOOL = 'assistant_suggest_workflow';

export function screenWorkflows(path: string, offered: readonly { id: string; label: string }[] = []): AssistantWorkflow[] {
  const clean = path.replace(/\/+$/, '') || '/';
  const ids: readonly string[] = clean === '/orders/new' ? ['prepare']
    : /^\/orders\/[^/]+\/edit$/.test(clean) ? ['discuss', 'intake', 'readiness', 'canvas']
    : /^\/orders\/[^/]+$/.test(clean) ? ['review']
    : clean === '/toolkit/canvas' ? ['canvas'] : [];
  const seen = new Set<string>();
  return offered.filter(item => ids.includes(item.id) && !seen.has(item.id) && !!seen.add(item.id)
      && typeof item.label === 'string' && !!item.label.trim())
    .map(item => ({ id: item.id as AssistantWorkflowId, label: item.label.trim().slice(0, 100) }));
}
