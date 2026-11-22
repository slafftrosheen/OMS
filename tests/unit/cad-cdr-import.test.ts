import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { describe, it } from 'vitest';
import { vectorUploadPayload, VECTOR_FILE_LIMIT } from '../../src/lib/components/canvas/cad-vector-file';
import { vectorFileKind, VectorConversionError } from '../../src/lib/server/cad/convert-vector';

const riff = Buffer.from('524946460400000043445243', 'hex');
const blob = (bytes: Buffer) => new Blob([new Uint8Array(bytes)]);

function packedCdr(name = 'content/root.dat', size = riff.length) {
  const filename = Buffer.from(name);
  const compressed = deflateRawSync(riff);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(size, 22);
  local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(size, 24);
  central.writeUInt16LE(filename.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12);
  end.writeUInt32LE(local.length + filename.length + compressed.length, 16);
  return Buffer.concat([local, filename, compressed, central, filename, end]);
}

describe('CDR upload classification', () => {
  it('recognizes RIFF and both CorelDRAW archive entry points without relying on extensions', async () => {
    for (const bytes of [riff, packedCdr(), packedCdr('content/riffData.cdr')]) {
      const result = await vectorUploadPayload(blob(bytes));
      assert.equal(result.kind, 'cdr');
      assert.deepEqual(Buffer.from(await result.body.arrayBuffer()), bytes);
      assert.equal(vectorFileKind(bytes), 'cdr');
    }
  });

  it('rejects non-CDR, traversal, corrupt directories and excessive ZIP expansion', async () => {
    for (const bytes of [packedCdr('content.xml'), packedCdr('../content/root.dat'),
      packedCdr().subarray(0, -1), packedCdr('content/root.dat', 129 * 1024 * 1024)]) {
      await assert.rejects(vectorUploadPayload(blob(bytes)), /format/);
      assert.throws(() => vectorFileKind(bytes), (error: unknown) => error instanceof VectorConversionError && error.status === 415);
    }
  });

  it('enforces request size and rejects false declared inflated sizes on the server', async () => {
    const large = new Blob([new Uint8Array(riff), new Uint8Array(VECTOR_FILE_LIMIT)]);
    await assert.rejects(vectorUploadPayload(large), /limit/);
    const understated = packedCdr('content/root.dat', riff.length - 1);
    const malformed = packedCdr('content/root.dat', riff.length + 1);
    for (const bytes of [understated, malformed])
      assert.throws(() => vectorFileKind(bytes), (error: unknown) => error instanceof VectorConversionError && error.status === 415);
  });
});
