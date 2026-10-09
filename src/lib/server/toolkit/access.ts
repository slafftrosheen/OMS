import { error } from '@sveltejs/kit';
import { canManageSharedInventory } from '$lib/server/authz/shared-data';

export function requireToolkitManager(user: { id: string; role: string } | null | undefined) {
  if (!user) throw error(401, 'Sign in to access Toolkit');
  if (!canManageSharedInventory(user.role)) throw error(403, 'Toolkit projects are restricted to RD, Boss and Head of Production');
  return user;
}
export function validateCanvasTitle(value: unknown): string {
  if (typeof value !== 'string') throw error(400, 'Project title must be text');
  const title = value.trim();
  if (!title || title.length > 120) throw error(400, 'Project title must be 1–120 characters');
  return title;
}
export function validateCanvasPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw error(400, 'Canvas payload must be an object');
  }
  const payload = value as Record<string, unknown>;
  // Shared canvas snapshots must never contain per-user conversations.
  if (['conversation','conversations','messages','proposals'].some(key => key in payload)) {
    throw error(400, 'Personal conversations must use the private conversation endpoint');
  }
  const serialized = JSON.stringify(payload);
  if (!serialized || serialized.length > 2_000_000) throw error(413, 'Canvas exceeds the 2 MB save limit');
  return payload;
}
export function validateCanvasRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw error(400, 'Expected revision is required');
  return Number(value);
}
export function isToolkitConflict(status: number): boolean { return status === 409; }
