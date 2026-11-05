/** Read a webhook update with a hard byte cap and deadline, before JSON parsing.
 * request.text() alone allows an arbitrarily large streaming request in memory. */
export class TelegramWebhookBodyError extends Error {
  constructor(public status: 400 | 408 | 413) { super('Invalid Telegram update payload'); }
}
export async function readTelegramWebhookBody(request: Request, limit = 65536, timeoutMs = 10000): Promise<unknown> {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit))
    throw new TelegramWebhookBodyError(413);
  if (!request.body) throw new TelegramWebhookBodyError(400);
  const reader = request.body.getReader();
  const deadline = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
  const onAbort = () => { void reader.cancel().catch(() => {}); };
  deadline.addEventListener('abort', onAbort, { once: true });
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      if (deadline.aborted) throw new TelegramWebhookBodyError(408);
      const { value, done } = await reader.read();
      if (deadline.aborted) throw new TelegramWebhookBodyError(408);
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new TelegramWebhookBodyError(413);
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof TelegramWebhookBodyError) throw error;
    throw new TelegramWebhookBodyError(deadline.aborted ? 408 : 400);
  } finally {
    deadline.removeEventListener('abort', onAbort);
    try { reader.releaseLock(); } catch { /* cancelled reader */ }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { throw new TelegramWebhookBodyError(400); }
}
