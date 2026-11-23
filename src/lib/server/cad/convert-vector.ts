import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, open, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { inflateRawSync } from "node:zlib";

import { dosEpsSection, VECTOR_CONVERSION_LIMIT, VECTOR_PDF_INPUT_LIMIT, vectorPayloadKind } from "../../components/canvas/cad-vector-file";
import { isCdrArchive } from "../../components/canvas/cad-cdr-file";

const PDF_OUTPUT_LIMIT = 40 * 1024 * 1024;
const runProcess = promisify(execFile);
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
export function vectorFileKind(bytes: Uint8Array): "pdf" | "eps" | "cdr" {
  const payload = unwrapEps(bytes);
  if (payload[0] === 0x50 && payload[1] === 0x4b) {
    const cdr = payload === bytes && isCdrArchive(payload, (data, size, method) => {
      if (method === 0) return data.length === size;
      try {
        return inflateRawSync(data, { maxOutputLength: Math.max(1, size) }).length === size;
      } catch {
        return false;
      }
    });
    if (cdr) return "cdr";
    throw new VectorConversionError("format", 415);
  }
  const kind = vectorPayloadKind(payload);
  if (kind && (payload === bytes || kind === "eps")) return kind;
  throw new VectorConversionError("format", 415);
}

/** Import through the explicit Draw CDR filter in a private, disposable profile. */
async function convertCdrPage(directory: string, input: string, page: number, signal?: AbortSignal): Promise<string> {
  const profile = join(directory, "profile");
  const userProfile = join(profile, "user");
  await mkdir(userProfile, { recursive: true, mode: 0o700 });
  await writeFile(join(userProfile, "registrymodifications.xcu"),
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<oor:items xmlns:oor="http://openoffice.org/2001/registry">' +
    '<item oor:path="/org.openoffice.Office.Common/Security/Scripting">' +
    '<prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop>' +
    '<prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop>' +
    '</item></oor:items>', { mode: 0o600 });
  const filter = JSON.stringify({ PageRange: { type: "string", value: String(page) } });
  try {
    await runProcess(process.platform === "win32" ? "soffice.com" : "soffice", [
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
      "--headless", "--invisible", "--nologo", "--norestore", "--nodefault",
      "--infilter=Corel Draw Document", "--convert-to", `pdf:draw_pdf_Export:${filter}`,
      "--outdir", directory, input,
    ], {
      cwd: directory,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, HOME: directory,
        TMPDIR: directory, TEMP: directory, TMP: directory },
      timeout: 35_000,
      signal,
      killSignal: "SIGKILL",
      maxBuffer: 64 * 1024,
      windowsHide: true,
    });
  } catch (cause) {
    if (signal?.aborted) throw new VectorConversionError("cancelled", 499);
    const error = cause as NodeJS.ErrnoException & { killed?: boolean };
    if (error.code === "ENOENT") throw new VectorConversionError("cdr-converter-unavailable", 503);
    if (error.killed) throw new VectorConversionError("timeout");
    throw new VectorConversionError("cdr-conversion");
  }
  const output = join(directory, "input.pdf");
  const file = await open(output, "r").catch(() => { throw new VectorConversionError("cdr-conversion"); });
  try {
    const metadata = await file.stat();
    if (metadata.size > PDF_OUTPUT_LIMIT) throw new VectorConversionError("vector-output-limit", 413);
    const header = Buffer.alloc(8);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    if (!metadata.isFile() || bytesRead < 8 || vectorPayloadKind(header) !== "pdf")
      throw new VectorConversionError("cdr-conversion");
  } finally {
    await file.close();
  }
  return output;
}
/** Local, bounded conversion. Never accepts URLs, shell commands or caller-supplied flags. */
export async function convertVectorFile(
  bytes: Uint8Array,
  page: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (!Number.isInteger(page) || page < 1 || page > 5000)
    throw new VectorConversionError("page", 400);
  if (signal?.aborted) throw new VectorConversionError("cancelled", 499);
  if (bytes.length < 8) throw new VectorConversionError("format", 415);
  if (bytes.length > VECTOR_CONVERSION_LIMIT) throw new VectorConversionError("vector-input-limit", 413);
  if (active >= 2) throw new VectorConversionError("busy", 429);
  active++;
  let directory: string | undefined;
  try {
    const kind = vectorFileKind(bytes);
    if (kind === "pdf" && bytes.length > VECTOR_PDF_INPUT_LIMIT)
      throw new VectorConversionError("vector-input-limit", 413);
    if (kind === "eps" && page !== 1) throw new VectorConversionError("page", 400);
    bytes = unwrapEps(bytes);
    directory = await mkdtemp(join(tmpdir(), "oms-vector-"));
    let input = join(directory, `input.${kind}`);
    await writeFile(input, bytes, { mode: 0o600, signal });
    if (kind === "cdr") {
      input = await convertCdrPage(directory, input, page, signal);
      page = 1;
    }
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
        30000,
      );
      const abort = () => stop(new VectorConversionError("cancelled", 499));
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      };
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      child.stdout.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > PDF_OUTPUT_LIMIT)
          stop(new VectorConversionError("vector-output-limit", 413));
        else chunks.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-8192);
      });
      child.on("error", (error: NodeJS.ErrnoException) => {
        cleanup();
        reject(
          new VectorConversionError(
            error.code === "ENOENT" ? "converter-unavailable" : "conversion",
            503,
          ),
        );
      });
      child.on("close", (code) => {
        cleanup();
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
  } catch (cause) {
    if (signal?.aborted) throw new VectorConversionError("cancelled", 499);
    throw cause;
  } finally {
    try {
      if (directory) await rm(directory, { recursive: true, force: true });
    } finally {
      active--;
    }
  }
}
