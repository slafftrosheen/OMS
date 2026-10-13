/** Server-owned model allow-list for the private Toolkit.
 * No arbitrary browser-provided OpenRouter model IDs or implied capabilities.
 */
import { OPENROUTER_MODEL } from '$lib/server/config';

export interface ToolkitModelChoice { id: string; label: string; isDefault: boolean; }
const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:+-]*$/i;
export function toolkitModelChoices(defaultModel = OPENROUTER_MODEL, configured = process.env.OPENROUTER_TOOLKIT_MODELS ?? ''): ToolkitModelChoice[] {
  const candidates = [defaultModel, ...configured.split(/[;,\n]/)];
  const unique = new Set<string>();
  for (const raw of candidates) {
    const id = raw.trim();
    if (MODEL_ID.test(id)) unique.add(id);
    if (unique.size >= 9) break;
  }
  // Preserve the existing router fallback even for legacy installs.
  if (unique.size === 0) unique.add('openrouter/free');
  return [...unique].map((id, index) => ({
    id, isDefault: index === 0,
    label: id === 'openrouter/free' ? 'OpenRouter Free Router'
      : id.split('/').slice(-1)[0].replace(/:(free|online)$/g, ' ($1)').replace(/[-_]/g, ' ')
  }));
}
export function resolveToolkitModel(value: unknown, choices = toolkitModelChoices()): string | null {
  if (value === undefined || value === null || value === '') return choices[0]?.id ?? null;
  return typeof value === 'string' && choices.some(entry => entry.id === value) ? value : null;
}
export function allowOpenRouterWebSearch(): boolean {
  return process.env.OPENROUTER_TOOLKIT_WEB_SEARCH === 'true';
}
