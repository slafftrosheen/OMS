import { traceRaster } from "./cad-trace";
self.onmessage = (event) => {
  try {
    self.postMessage({
      result: traceRaster(event.data.image, event.data.options),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "geometry",
    });
  }
};
