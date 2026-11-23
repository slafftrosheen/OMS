import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireToolkitManager } from "$lib/server/toolkit/access";
import { checkAiRateLimit } from "$lib/server/api/helpers";
import { VECTOR_CONVERSION_LIMIT } from "$lib/components/canvas/cad-vector-file";
import {
  convertVectorFile,
  VectorConversionError,
} from "$lib/server/cad/convert-vector";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
let uploads = 0;
export const POST: RequestHandler = async ({ locals, request, url }) => {
  const user = requireToolkitManager(locals.user);
  const rate = checkAiRateLimit(`vector-conversion:${user.id}`);
  if (!rate.allowed)
    return json(
      { code: "busy" },
      {
        status: 429,
        headers: { ...headers, "Retry-After": String(rate.retryAfter) },
      },
    );
  // Count the stream as well as Content-Length: chunked bodies cannot bypass the cap.
  const length = Number(request.headers.get("content-length"));
  if (length > VECTOR_CONVERSION_LIMIT)
    return json({ code: "vector-input-limit" }, { status: 413, headers });
  if (uploads >= 2) return json({ code: "busy" }, { status: 429, headers: { ...headers, "Retry-After": "5" } });
  const reader = request.body?.getReader();
  if (!reader) return json({ code: "format" }, { status: 400, headers });
  uploads++;
  try {
    const declared = Number.isSafeInteger(length) && length > 0 ? Buffer.allocUnsafe(length) : undefined;
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const next = bytes + value.byteLength;
      if (next > VECTOR_CONVERSION_LIMIT || declared && next > declared.length) {
        await reader.cancel().catch(() => {});
        throw new VectorConversionError("vector-input-limit", 413);
      }
      if (declared) declared.set(value, bytes);
      else chunks.push(value);
      bytes = next;
    }
    if (declared && bytes !== declared.length) throw new VectorConversionError("format", 400);
    const output = await convertVectorFile(
      declared ?? Buffer.concat(chunks, bytes),
      Number(url.searchParams.get("page") ?? 1),
      request.signal,
    );
    return new Response(new Uint8Array(output.buffer as ArrayBuffer, output.byteOffset, output.byteLength), {
      headers: { ...headers, "Content-Type": "application/pdf" },
    });
  } catch (error) {
    return json(
      {
        code:
          error instanceof VectorConversionError ? error.code : "conversion",
      },
      {
        status: error instanceof VectorConversionError ? error.status : 422,
        headers,
      },
    );
  } finally {
    reader.releaseLock();
    uploads--;
  }
};
