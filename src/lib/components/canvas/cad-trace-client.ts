import type { TraceOptions } from "./cad-trace-options";
import type { VectorDocument } from "./cad-vector";

export function runRasterTrace(
  image: ImageData,
  options: TraceOptions,
  signal: AbortSignal,
): Promise<VectorDocument> {
  if (signal.aborted) return Promise.reject(new Error("cancelled"));
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./cad-trace.worker.ts", import.meta.url),
      { type: "module" },
    );
    let settled = false;
    const finish = (error?: Error, result?: VectorDocument) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.onmessage = null; worker.onerror = null;
      if (error) reject(error); else resolve(result!);
    };
    const abort = () => finish(new Error("cancelled"));
    const timer = setTimeout(() => {
      finish(new Error("timeout"));
    }, 30000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event) => {
      if (event.data?.error) finish(new Error(event.data.error));
      else if (!event.data?.result) finish(new Error("geometry"));
      else finish(undefined, event.data.result);
    };
    worker.onerror = () => finish(new Error("geometry"));
    if (signal.aborted) abort();
    else try { worker.postMessage({ image, options }); }
    catch { finish(new Error("geometry")); }
  });
}
