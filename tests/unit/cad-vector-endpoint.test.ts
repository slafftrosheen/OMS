import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { vectorUploadPayload, VECTOR_CONVERSION_LIMIT, VECTOR_PDF_INPUT_LIMIT } from "../../src/lib/components/canvas/cad-vector-file";
import { POST } from "../../src/routes/api/canvas/convert-vector/+server";
import {
  unwrapEps,
  vectorFileKind,
} from "../../src/lib/server/cad/convert-vector";

describe("local vector conversion boundary", () => {
  it("rejects unauthenticated and ordinary users before consuming content", async () => {
    for (const [user, status] of [
      [null, 401],
      [{ id: "worker", role: "Employee" }, 403],
    ] as const) {
      let read = false;
      const event = {
        locals: { user },
        request: {
          get body() {
            read = true;
            throw new Error("must not read");
          },
        },
      };
      await assert.rejects(
        async () => POST(event as any),
        (error: any) => error.status === status,
      );
      assert.equal(read, false);
    }
  });
  it("caps a chunked body even without Content-Length and cancels its reader", async () => {
    let cancelled = false,
      calls = 0;
    const request = new Request("http://localhost/api/canvas/convert-vector", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new ReadableStream({
        pull(controller) {
          calls++;
          controller.enqueue(new Uint8Array(VECTOR_CONVERSION_LIMIT + 1));
        },
        cancel() {
          cancelled = true;
        },
      }),
      duplex: "half",
    } as any);
    const response = await POST({
      request,
      url: new URL(request.url),
      locals: { user: { id: "vector-limit-qa", role: "RD" } },
    } as any);
    assert.equal(response.status, 413);
    assert.equal(cancelled, true);
    assert.ok(calls <= 2);
    assert.deepEqual(await response.json(), { code: "vector-input-limit" });
  });
  it("unwraps bounded DOS EPS and refuses offsets into or beyond its header", () => {
    const ps = Buffer.from(
      "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 10 10\nshowpage\n",
    );
    const header = Buffer.alloc(30);
    header.set([0xc5, 0xd0, 0xd3, 0xc6]);
    header.writeUInt32LE(30, 4);
    header.writeUInt32LE(ps.length, 8);
    const bytes = Buffer.concat([header, ps, Buffer.from("preview bytes")]);
    assert.deepEqual(Buffer.from(unwrapEps(bytes)), ps);
    assert.equal(vectorFileKind(bytes), "eps");
    bytes.writeUInt32LE(20, 4);
    assert.throws(() => unwrapEps(bytes));
    bytes.writeUInt32LE(3000, 4);
    assert.throws(() => unwrapEps(bytes));
  });
});

describe("canvas vector upload payload", () => {
  const ps = Buffer.from("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: -8000 -100 12000 400\nshowpage\n");

  it("sends the original PostScript while skipping an oversized TIFF preview", async () => {
    const header = Buffer.alloc(30);
    const start = 32;
    header.set([0xc5, 0xd0, 0xd3, 0xc6]);
    header.writeUInt32LE(start, 4);
    header.writeUInt32LE(ps.length, 8);
    header.writeUInt32LE(start + ps.length, 20);
    header.writeUInt32LE(32 * 1024 * 1024, 24);
    const source = new Blob([new Uint8Array(header), new Uint8Array(start - header.length),
      new Uint8Array(ps), new Uint8Array(32 * 1024 * 1024)]);
    assert.ok(source.size > VECTOR_CONVERSION_LIMIT);
    const { kind, body } = await vectorUploadPayload(source);
    assert.equal(kind, "eps");
    assert.deepEqual(Buffer.from(await body.arrayBuffer()), ps);
    assert.equal(vectorFileKind(new Uint8Array(await body.arrayBuffer())), "eps");
  });

  it("accepts EPS above the former cap and still limits PDF to 12 MiB", async () => {
    const eps = new Blob([new Uint8Array(ps)]);
    const pdf = new Blob(["%PDF-1.7\n"]);
    assert.deepEqual(await vectorUploadPayload(eps), { kind: "eps", body: eps });
    assert.deepEqual(await vectorUploadPayload(pdf), { kind: "pdf", body: pdf });
    const tooLarge = new Blob(["%PDF-1.7\n", new Uint8Array(VECTOR_PDF_INPUT_LIMIT)]);
    await assert.rejects(vectorUploadPayload(tooLarge), /vector-input-limit/);
    const largeEps = new Blob([new Uint8Array(ps), new Uint8Array(VECTOR_PDF_INPUT_LIMIT + 1)]);
    assert.deepEqual(await vectorUploadPayload(largeEps), { kind: "eps", body: largeEps });
  });

  it("rejects truncated wrappers and oversized PostScript payloads", async () => {
    const header = Buffer.alloc(30);
    header.set([0xc5, 0xd0, 0xd3, 0xc6]);
    header.writeUInt32LE(30, 4);
    header.writeUInt32LE(VECTOR_CONVERSION_LIMIT + 1, 8);
    await assert.rejects(vectorUploadPayload(new Blob([new Uint8Array(header)])), /format/);
    const source = new Blob([new Uint8Array(header), new Uint8Array(VECTOR_CONVERSION_LIMIT + 1)]);
    await assert.rejects(vectorUploadPayload(source), /limit/);
  });
});
