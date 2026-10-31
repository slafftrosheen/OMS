import { json, type RequestEvent } from '@sveltejs/kit';
import { parseObject, WorkforceError } from '$lib/workforce/validation';

export async function readBody(event: Pick<RequestEvent, 'request'>): Promise<Record<string, unknown>> {
  const length = Number(event.request.headers.get('content-length') || '0');
  if (length > 8192) throw new WorkforceError('The request is too large.', 413, 'TOO_LARGE');
  const text = await event.request.text();
  if (text.length > 8192) throw new WorkforceError('The request is too large.', 413, 'TOO_LARGE');
  try { return parseObject(JSON.parse(text)); }
  catch (error) {
    if (error instanceof WorkforceError) throw error;
    throw new WorkforceError('The request must contain valid JSON.');
  }
}

export async function workforceResponse(action: () => Promise<unknown>): Promise<Response> {
  try {
    const result = await action();
    return result instanceof Response ? result : json(result, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof WorkforceError) return json({ error: error.message, code: error.code }, { status: error.status, headers: { 'cache-control': 'private, no-store' } });
    console.error('[workforce] request failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    return json({ error: 'Workforce records are temporarily unavailable. Please try again.', code: 'UNAVAILABLE' }, { status: 503, headers: { 'cache-control': 'private, no-store' } });
  }
}
