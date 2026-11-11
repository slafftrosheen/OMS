/** Binary DXF (R12 and R13+) shares the ASCII group/value schema. Decode bytes
 * before parsing entities; never run binary data through File.text(). */
export type DxfPair = [number, string];
const MAGIC = "AutoCAD Binary DXF\r\n\x1a\0";
const stringCode = (c: number) =>
  c <= 9 ||
  (c >= 100 && c <= 105) ||
  (c >= 300 && c <= 309) ||
  (c >= 320 && c <= 369) ||
  (c >= 390 && c <= 399) ||
  (c >= 410 && c <= 419) ||
  (c >= 430 && c <= 439) ||
  (c >= 470 && c <= 481) ||
  c === 999 ||
  (c >= 1000 && c <= 1003) ||
  c === 1005;
const doubleCode = (c: number) =>
  (c >= 10 && c <= 59) ||
  (c >= 110 && c <= 149) ||
  (c >= 210 && c <= 239) ||
  (c >= 460 && c <= 469) ||
  (c >= 1010 && c <= 1059);
const shortCode = (c: number) =>
  (c >= 60 && c <= 79) ||
  (c >= 170 && c <= 179) ||
  (c >= 270 && c <= 289) ||
  (c >= 370 && c <= 389) ||
  (c >= 400 && c <= 409) ||
  c === 1070;
const intCode = (c: number) =>
  (c >= 90 && c <= 99) ||
  (c >= 420 && c <= 429) ||
  (c >= 440 && c <= 459) ||
  c === 1071;
function encoding(header: string) {
  if (/AC10(?:2[1-9]|[3-9]\d)/.test(header)) return "utf-8";
  const cp = /ANSI_(\d+)/.exec(header)?.[1];
  const legacy: Record<string, string> = {
    "874": "windows-874",
    "932": "shift_jis",
    "936": "gbk",
    "949": "euc-kr",
    "950": "big5",
  };
  if (cp && legacy[cp]) return legacy[cp];
  return cp &&
    [
      "1250",
      "1251",
      "1252",
      "1253",
      "1254",
      "1255",
      "1256",
      "1257",
      "1258",
    ].includes(cp)
    ? `windows-${cp}`
    : "windows-1252";
}
export function decodeDxf(bytes: Uint8Array): string {
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("limit");
  const header = new TextDecoder("latin1").decode(bytes.subarray(0, 65536));
  if (!header.startsWith(MAGIC))
    return new TextDecoder(encoding(header), { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/, "");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    legacy = bytes[23] !== 0,
    decoder = new TextDecoder(encoding(header), { fatal: true });
  const lines: string[] = [];
  let offset = 22,
    pairs = 0;
  const need = (size: number) => {
    if (offset + size > bytes.length) throw new Error("format");
  };
  while (offset < bytes.length) {
    if (++pairs > 250000) throw new Error("limit");
    need(legacy ? 1 : 2);
    let code = legacy ? view.getUint8(offset++) : view.getUint16(offset, true);
    if (!legacy) offset += 2;
    if (legacy && code === 255) {
      need(2);
      code = view.getUint16(offset, true);
      offset += 2;
    }
    let value: string;
    if (stringCode(code)) {
      const end = bytes.indexOf(0, offset);
      if (end < 0 || end - offset > 65536) throw new Error("format");
      value = decoder.decode(bytes.subarray(offset, end));
      offset = end + 1;
      if (/[\r\n\0]/.test(value)) throw new Error("format");
    } else if (doubleCode(code)) {
      need(8);
      const n = view.getFloat64(offset, true);
      offset += 8;
      if (!Number.isFinite(n)) throw new Error("format");
      value = String(n);
    } else if (shortCode(code)) {
      need(2);
      value = String(view.getInt16(offset, true));
      offset += 2;
    } else if (intCode(code)) {
      need(4);
      value = String(view.getInt32(offset, true));
      offset += 4;
    } else if (code >= 160 && code <= 169) {
      need(8);
      value = String(view.getBigInt64(offset, true));
      offset += 8;
    } else if (code >= 290 && code <= 299) {
      need(1);
      const n = view.getUint8(offset++);
      if (n > 1) throw new Error("format");
      value = String(n);
    } else if ((code >= 310 && code <= 319) || code === 1004) {
      need(1);
      const n = bytes[offset++];
      need(n);
      value = Array.from(bytes.subarray(offset, offset + n), (v) =>
        v.toString(16).padStart(2, "0"),
      ).join("");
      offset += n;
    } else throw new Error("format");
    lines.push(String(code), value);
    if (code === 0 && value === "EOF") {
      if (offset !== bytes.length) throw new Error("format");
      return lines.join("\n") + "\n";
    }
  }
  throw new Error("format");
}
