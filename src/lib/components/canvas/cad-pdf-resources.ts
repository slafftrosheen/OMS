/** Bundle PDF.js's own standard fonts and packed CMaps as local Vite assets.
 * Rendering must not depend on fonts installed on the operator's computer. */
const fontUrls = import.meta.glob<string>(
  "/node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}",
  { eager: true, query: "?url", import: "default" },
);
const cmapUrls = import.meta.glob<string>(
  "/node_modules/pdfjs-dist/cmaps/*.bcmap",
  { eager: true, query: "?url", import: "default" },
);
async function resource(urls: Record<string, string>, name: string) {
  const entry = Object.entries(urls).find(([path]) =>
    path.endsWith("/" + name),
  );
  if (!entry) throw new Error("Unknown PDF resource");
  const response = await fetch(entry[1]);
  if (!response.ok) throw new Error("PDF resource unavailable");
  return new Uint8Array(await response.arrayBuffer());
}
export class CanvasPdfFonts {
  async fetch({ filename }: { filename: string }) {
    return resource(fontUrls, filename);
  }
}
export class CanvasPdfCMaps {
  async fetch({ name }: { name: string }) {
    return {
      cMapData: await resource(cmapUrls, name + ".bcmap"),
      compressionType: 1,
    };
  }
}
