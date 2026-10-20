// Read-only compilation fingerprint. Safe to access without credentials.
// Never return deployment environment variables or local server paths.
import { json, type RequestHandler } from '@sveltejs/kit';
import { buildInfo } from '$lib/build-info';

export const GET: RequestHandler = async () =>
  json(buildInfo, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Pragma': 'no-cache'
    }
  });
