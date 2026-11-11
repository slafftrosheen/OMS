import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { POST } from "../../src/routes/api/canvas/convert-vector/+server";
import {
  VECTOR_FILE_LIMIT,
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
          controller.enqueue(new Uint8Array(VECTOR_FILE_LIMIT + 1));
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
    assert.deepEqual(await response.json(), { code: "limit" });
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
