/** Shared bounded body reader. Content-Length alone is not a memory boundary. */
export class RequestBodyError extends Error {
  constructor(public status: 400 | 413 = 400) { super(status === 413 ? 'Request body is too large.' : 'Invalid JSON request.'); }
}
export async function readBoundedJson(request: Request, limit = 16_384): Promise<unknown> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('A positive byte limit is required');
  if (Number(request.headers.get('content-length')) > limit) throw new RequestBodyError(413);
  if (!request.body) throw new RequestBodyError();
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) throw new RequestBodyError(413);
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (cause) {
    // Closing a failed/oversized transport must not mask the validation error
    // or keep an HTTP response waiting on an uncooperative cancellation hook.
    void reader.cancel().catch(() => {});
    if (cause instanceof RequestBodyError) throw cause;
    throw new RequestBodyError();
  } finally { reader.releaseLock(); }
}
