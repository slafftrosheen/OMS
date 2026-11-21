import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { dosEpsSection, VECTOR_FILE_LIMIT, vectorPayloadKind } from "../../components/canvas/cad-vector-file";

export { VECTOR_FILE_LIMIT };
let active = 0;
export class VectorConversionError extends Error {
  constructor(
    public code: string,
    public status = 422,
  ) {
    super(code);
  }
}
/** DOS EPS may wrap PostScript with TIFF/WMF previews. Only its bounded PS section
 * reaches the interpreter; preview bytes are never treated as executable input. */
export function unwrapEps(bytes: Uint8Array): Uint8Array {
  try {
    const section = dosEpsSection(bytes);
    return section ? bytes.subarray(section.start, section.end) : bytes;
  } catch {
    throw new VectorConversionError("format", 415);
  }
}
export function vectorFileKind(bytes: Uint8Array): "pdf" | "eps" {
  const payload = unwrapEps(bytes);
  const kind = vectorPayloadKind(payload);
  if (kind && (payload === bytes || kind === "eps")) return kind;
  throw new VectorConversionError("format", 415);
}
/** Local, bounded conversion. Never accepts URLs, shell commands or caller-supplied flags. */
export async function convertVectorFile(
  bytes: Uint8Array,
  page: number,
): Promise<Buffer> {
  if (bytes.length < 8 || bytes.length > VECTOR_FILE_LIMIT)
    throw new VectorConversionError("limit", 413);
  const kind = vectorFileKind(bytes);
  bytes = unwrapEps(bytes);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 5000 ||
    (kind === "eps" && page !== 1)
  )
    throw new VectorConversionError("page", 400);
  if (active >= 2) throw new VectorConversionError("busy", 429);
  active++;
  let directory: string | undefined;
  try {
    directory = await mkdtemp(join(tmpdir(), "oms-vector-"));
    const input = join(directory, `input.${kind}`);
    await writeFile(input, bytes, { mode: 0o600 });
    return await new Promise<Buffer>((resolve, reject) => {
      const args = [
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-dQUIET",
        "-dPDFSTOPONERROR",
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.7",
        "-dNoOutputFonts",
        "-sColorConversionStrategy=RGB",
        "-dProcessColorModel=/DeviceRGB",
        `-dFirstPage=${page}`,
        `-dLastPage=${page}`,
        ...(kind === "eps" ? ["-dEPSCrop"] : []),
        "-sOutputFile=-",
        input,
      ];
      const child = spawn("gs", args, {
        cwd: directory,
        env: { PATH: process.env.PATH, TMPDIR: directory },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const chunks: Buffer[] = [];
      let size = 0,
        stderr = "",
        failure: VectorConversionError | undefined;
      const stop = (error: VectorConversionError) => {
        failure ??= error;
        child.kill("SIGKILL");
      };
      const timer = setTimeout(
        () => stop(new VectorConversionError("timeout")),
        20000,
      );
      child.stdout.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 20 * 1024 * 1024)
          stop(new VectorConversionError("limit", 413));
        else chunks.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-8192);
      });
      child.on("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(
          new VectorConversionError(
            error.code === "ENOENT" ? "converter-unavailable" : "conversion",
            503,
          ),
        );
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (failure) return reject(failure);
        if (code !== 0 || size < 8)
          return reject(new VectorConversionError("conversion"));
        if (/substitut|cannot find.*font|not found.*font/i.test(stderr))
          return reject(new VectorConversionError("font"));
        const output = Buffer.concat(chunks);
        if (!output.subarray(0, 5).equals(Buffer.from("%PDF-")))
          return reject(new VectorConversionError("conversion"));
        resolve(output);
      });
    });
  } finally {
    try {
      if (directory) await rm(directory, { recursive: true, force: true });
    } finally {
      active--;
    }
  }
}
