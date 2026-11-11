import type { TraceOptions } from "./cad-trace";
import type { VectorDocument } from "./cad-vector";

export function runRasterTrace(
  image: ImageData,
  options: TraceOptions,
  signal: AbortSignal,
): Promise<VectorDocument> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./cad-trace.worker.ts", import.meta.url),
      { type: "module" },
    );
    const cleanup = () => {
      worker.terminate();
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new Error("cancelled"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("limit"));
    }, 30000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event) => {
      cleanup();
      event.data.error
        ? reject(new Error(event.data.error))
        : resolve(event.data.result);
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("geometry"));
    };
    if (signal.aborted) abort();
    else worker.postMessage({ image, options });
  });
}
