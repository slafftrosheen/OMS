import { error as kitError, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadOrderFile, rethrowUploadError, uploadSuccessStatus } from '$lib/server/files/upload';
import { ORDER_FILE_BUCKET, MAX_ORDER_FILE_BYTES } from '$lib/server/files/order-storage';
import { toolkitUploadReadiness } from '$lib/server/toolkit/assets';

const noStore = { 'Cache-Control': 'private, no-store' };
const managers = new Set(['RD', 'Boss', 'HeadOfProduction']);

/** Read-only preflight for diagnosing 503 uploads on an authenticated OMS host.
 * SELECT/list access does not prove Storage INSERT permission: only an actual
 * authorized upload can verify write access. Nothing here mutates data.
 */
export const GET: RequestHandler = async ({ locals }) => {
  const user = locals.user;
  if (!user) throw kitError(401, 'Unauthorized');
  if (!managers.has(user.role)) throw kitError(403, 'Order upload diagnostics require production management');

  const capacity = toolkitUploadReadiness(process.env.BODY_SIZE_LIMIT);
  const [bucket, files, links] = await Promise.all([
    locals.supabase.storage.from(ORDER_FILE_BUCKET).list('', { limit: 1 })
      .then(({ error }) => ({ ok: !error, code: String((error as { statusCode?: number | string } | null)?.statusCode ?? '') }))
      .catch(() => ({ ok: false, code: '' })),
    Promise.resolve(locals.supabase.from('files').select('id').limit(1))
      .then(({ error }) => ({ ok: !error, code: error?.code ?? '' }))
      .catch(() => ({ ok: false, code: '' })),
    Promise.resolve(locals.supabase.from('order_files').select('id').limit(1))
      .then(({ error }) => ({ ok: !error, code: error?.code ?? '' }))
      .catch(() => ({ ok: false, code: '' }))
  ]);

  const ready = capacity.ready && bucket.ok && files.ok && links.ok;
  return json({
    ready,
    uploadLimit: {
      ready: capacity.ready,
      configuredLimitBytes: capacity.configuredLimitBytes,
      expectedSetting: capacity.expectedSetting,
      maxFileBytes: MAX_ORDER_FILE_BYTES
    },
    storageBucket: { name: ORDER_FILE_BUCKET, readable: bucket.ok, statusCode: bucket.code || null },
    database: { filesReadable: files.ok, filesCode: files.code || null,
      linksReadable: links.ok, linksCode: links.code || null },
    storageWriteVerified: false,
    note: 'Readiness verifies limits and read access, not the private Storage INSERT policy or actual uploads.'
  }, { status: ready ? 200 : 503, headers: noStore });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const result = await uploadOrderFile(request, locals);
    return json(result, { status: uploadSuccessStatus(), headers: noStore });
  } catch (err) {
    rethrowUploadError(err);
  }
};
