import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadOrderFile, rethrowUploadError, uploadSuccessStatus } from '$lib/server/files/upload';

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const result = await uploadOrderFile(request, locals);
    return json(result, { status: uploadSuccessStatus() });
  } catch (err) {
    rethrowUploadError(err);
  }
};
