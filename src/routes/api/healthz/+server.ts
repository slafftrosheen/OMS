// Liveness: no database, auth, or AI dependencies.
import { json, type RequestHandler } from '@sveltejs/kit';
export const GET: RequestHandler = async () =>
  json({ status: 'ok', service: 'oms' }, { headers: { 'Cache-Control': 'no-store' } });
