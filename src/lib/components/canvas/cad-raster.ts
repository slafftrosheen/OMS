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
/** Self-contained, bounded PNG plus losslessly compressed PDF channels. No
 * external URL or executable SVG can enter a saved drawing through this path. */
export async function encodePdfRaster(
  image: any,
): Promise<Omit<VectorRaster, "matrix">> {
  const { width, height } = image;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 16e6
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
    if (!d) throw new Error("format");
    for (let i = 0; i < width * height; i++) {
      if (image.kind === 3) out.data.set(d.subarray(i * 4, i * 4 + 4), i * 4);
      else if (image.kind === 2)
        out.data.set([d[i * 3], d[i * 3 + 1], d[i * 3 + 2], 255], i * 4);
      else if (image.kind === 1) {
        const x = i % width,
          y = Math.floor(i / width),
          v =
            d[y * Math.ceil(width / 8) + (x >> 3)] & (128 >> (x % 8)) ? 255 : 0;
        out.data.set([v, v, v, 255], i * 4);
      } else throw new Error("format");
    }
    ctx.putImageData(out, 0, 0);
  }
  const scale = Math.min(1, 1024 / Math.max(width, height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const target = canvas.getContext("2d")!;
  target.drawImage(source, 0, 0, canvas.width, canvas.height);
  const rgba = target.getImageData(0, 0, canvas.width, canvas.height).data,
    rgb = new Uint8Array(canvas.width * canvas.height * 3),
    alpha = new Uint8Array(canvas.width * canvas.height);
  let transparent = false;
  for (let i = 0; i < alpha.length; i++) {
    rgb.set(rgba.subarray(i * 4, i * 4 + 3), i * 3);
    alpha[i] = rgba[i * 4 + 3];
    transparent ||= alpha[i] !== 255;
  }
  const result = {
    width: canvas.width,
    height: canvas.height,
    png: canvas.toDataURL("image/png"),
    rgb: await deflateRaster(rgb),
    ...(transparent ? { alpha: await deflateRaster(alpha) } : {}),
  };
  if (JSON.stringify(result).length > 750000) throw new Error("limit");
  return result;
}
