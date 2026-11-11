import type { VectorRaster } from "./cad-appearance";
const base64 = (data: Uint8Array) => {
  let s = "";
  for (let i = 0; i < data.length; i += 8192)
    s += String.fromCharCode(...data.subarray(i, i + 8192));
  return btoa(s);
};
export async function deflateRaster(data: Uint8Array) {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return base64(new Uint8Array(await new Response(stream).arrayBuffer()));
}
/** Preserve original pixels. Persist large PNGs through authenticated asset storage;
 * materialize lossless RGB/alpha channels only for portable PDF/EPS export. */
export async function encodePdfRaster(
  image: any,
  options: {
    store?: (file: File) => Promise<{ id: string; url: string }>;
    name?: string;
    exportOnly?: boolean;
  } = {},
): Promise<Omit<VectorRaster, "matrix">> {
  const { width, height } = image;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 16384 ||
    height > 16384 ||
    width * height > 32 * 1024 * 1024
  )
    throw new Error("limit");
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const ctx = source.getContext("2d")!;
  if (image.bitmap) ctx.drawImage(image.bitmap, 0, 0);
  else {
    const out = ctx.createImageData(width, height),
      d = image.data;
    const length =
      image.kind === 1
        ? Math.ceil(width / 8) * height
        : image.kind === 2
          ? width * height * 3
          : image.kind === 3
            ? width * height * 4
            : Infinity;
    if (!d || d.length < length) throw new Error("format");
    for (let i = 0; i < width * height; i++) {
      if (image.kind === 3) out.data.set(d.subarray(i * 4, i * 4 + 4), i * 4);
      else if (image.kind === 2)
        out.data.set([d[i * 3], d[i * 3 + 1], d[i * 3 + 2], 255], i * 4);
      else if (image.kind === 1) {
        const x = i % width,
          y = Math.floor(i / width),
          v = d[y * Math.ceil(width / 8) + (x >> 3)] & (128 >> x % 8) ? 255 : 0;
        out.data.set([v, v, v, 255], i * 4);
      } else throw new Error("format");
    }
    ctx.putImageData(out, 0, 0);
  }
  const canvas = source,
    target = ctx;
  const rgba = target.getImageData(0, 0, width, height).data;
  let transparent = false;
  for (let i = 3; i < rgba.length; i += 4)
    if (rgba[i] !== 255) {
      transparent = true;
      break;
    }
  const png = canvas.toDataURL("image/png");
  if (png.length > Math.ceil((25 * 1024 * 1024 * 4) / 3) + 32)
    throw new Error("limit");
  // Large originals are private file references; snapshots never carry their pixels.
  if (options.store) {
    const blob = await (await fetch(png)).blob();
    const stored = await options
      .store(
        new File([blob], options.name ?? "PDF-image.png", {
          type: "image/png",
        }),
      )
      .catch((error) => {
        if (["asset-context", "cancelled"].includes(error?.message))
          throw error;
        throw new Error("asset-upload");
      });
    return {
      width: canvas.width,
      height: canvas.height,
      png: stored.url,
      external: true,
      fileId: stored.id,
      hasAlpha: transparent,
    };
  }
  const rgb = new Uint8Array(width * height * 3),
    alpha = transparent ? new Uint8Array(width * height) : undefined;
  for (let i = 0; i < width * height; i++) {
    rgb.set(rgba.subarray(i * 4, i * 4 + 3), i * 3);
    if (alpha) alpha[i] = rgba[i * 4 + 3];
  }
  const result = {
    width: canvas.width,
    height: canvas.height,
    png,
    rgb: await deflateRaster(rgb),
    ...(transparent ? { alpha: await deflateRaster(alpha!) } : {}),
  };
  if (!options.exportOnly && JSON.stringify(result).length > 1_500_000)
    throw new Error("asset-context");
  return result;
}
