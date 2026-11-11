import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireToolkitManager } from "$lib/server/toolkit/access";
import { checkAiRateLimit } from "$lib/server/api/helpers";
import {
  convertVectorFile,
  VECTOR_FILE_LIMIT,
  VectorConversionError,
} from "$lib/server/cad/convert-vector";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
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
  if (length > VECTOR_FILE_LIMIT)
    return json({ code: "limit" }, { status: 413, headers });
  const reader = request.body?.getReader();
  if (!reader) return json({ code: "format" }, { status: 400, headers });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > VECTOR_FILE_LIMIT) {
        await reader.cancel();
        throw new VectorConversionError("limit", 413);
      }
      chunks.push(value);
    }
    const output = await convertVectorFile(
      Buffer.concat(chunks),
      Number(url.searchParams.get("page") ?? 1),
    );
    return new Response(new Uint8Array(output), {
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
  }
};
