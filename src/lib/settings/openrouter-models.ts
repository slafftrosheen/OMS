export interface ModelSelection { textModel: string; visionModel: string }
export interface ModelChoice {
  id: string; name: string; text: boolean; image: boolean;
  structured: boolean; tools: boolean; free: boolean;
}
const modelId = /^[a-z0-9_-]+\/[a-z0-9_./:+-]{1,130}$/i;

export function parseModelSelection(input: unknown): ModelSelection {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose text and vision models');
  const row = input as Record<string, unknown>;
  if (Object.keys(row).length !== 2 || typeof row.textModel !== 'string' || typeof row.visionModel !== 'string'
    || !modelId.test(row.textModel.trim()) || !modelId.test(row.visionModel.trim()))
    throw new Error('Choose valid OpenRouter text and vision model IDs');
  return { textModel: row.textModel.trim(), visionModel: row.visionModel.trim() };
}

export function normalizeModelCatalog(payload: unknown): ModelChoice[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as {data?: unknown}).data))
    throw new Error('OpenRouter model catalog is unavailable');
  return (payload as {data: any[]}).data.filter(m => typeof m?.id === 'string' && modelId.test(m.id)).map(m => ({
    id: m.id, name: String(m.name || m.id).slice(0, 150),
    text: Array.isArray(m.architecture?.input_modalities) && m.architecture.input_modalities.includes('text'),
    image: Array.isArray(m.architecture?.input_modalities) && m.architecture.input_modalities.includes('image'),
    structured: Array.isArray(m.supported_parameters) && m.supported_parameters.includes('structured_outputs') && m.supported_parameters.includes('response_format'),
    tools: Array.isArray(m.supported_parameters) && m.supported_parameters.includes('tools'),
    free: m.pricing?.prompt === '0' && m.pricing?.completion === '0'
  })).sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name));
}

export function validateModelSelection(selection: ModelSelection, catalog: ModelChoice[]): ModelSelection {
  const text = catalog.find(m => m.id === selection.textModel);
  const vision = catalog.find(m => m.id === selection.visionModel);
  if (!text?.text || !text.tools) throw new Error('Choose an available text model with tool calling for the assistant');
  if (!vision?.image || !vision.structured)
    throw new Error('Choose an available vision model with image input and structured JSON output for order OCR');
  return selection;
}
