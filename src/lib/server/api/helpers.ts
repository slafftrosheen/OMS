/**
 * Server-side API helpers used across +server.ts handlers.
 *
 *  - requireAuth(locals)        Throws 401 unless `locals.user` is set.
 *  - requireAdmin(locals)       Throws 403 unless the user has the admin role.
 *  - validate(schema, value)    Zod-parses a value; throws a 400 with field errors.
 *  - okList / okOne / created   Standardised response builders.
 *  - aiRateLimit(identifier)    Per-user/IP throttle for AI endpoints.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { z } from 'zod';
import { isAdminRole } from '$lib/server/auth/session';

// ─── Auth ────────────────────────────────────────────────────────────────────

// Compatible with the global SvelteKit `Locals.user` (whose `roles` is
// `Record<string, string>` like `{Admin: 'SuperAdmin'}`) and older callers
// that expected `roles?: Record<string, boolean>`.
export interface AuthLocals {
    user?:
        | {
              id: string;
              email?: string | null;
              roles?: Record<string, string | boolean>;
              role?: string | null;
          }
        | null;
}

export function requireAuth(locals: AuthLocals) {
    const user = locals.user;
    if (!user) {
        throw error(401, 'Unauthorized');
    }
    return user;
}

export function requireAdmin(locals: AuthLocals) {
    const user = requireAuth(locals);
    const roles = user.roles ?? {};
    const role = user.role ?? '';
    const adminRoleValue = roles.Admin || roles.admin;
    const isAdmin = 
        isAdminRole(role) ||
        adminRoleValue === 'Admin' || 
        adminRoleValue === 'SuperAdmin' || 
        adminRoleValue === 'admin' ||
        adminRoleValue === true ||
        role.toLowerCase() === 'admin';

    if (!isAdmin) {
        throw error(403, 'Forbidden — admin role required');
    }
    return user;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function validate<T>(schema: z.ZodSchema<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message
        }));
        throw error(400, JSON.stringify({ message: 'Validation failed', issues }));
    }
    return parsed.data;
}

// ─── Response builders ───────────────────────────────────────────────────────
// Goal: every list endpoint returns `{ data: T[], pagination: {...} }`,
// every single-resource GET returns `{ data: T }`, every mutation returns
// `{ data: T }` with the appropriate status. Frontend defensive code can stop
// branching on shape.

export interface Pagination {
    page: number;
    limit: number;
    total: number;
    pages: number;
}

export function okList<T>(items: T[], pagination?: Partial<Pagination>) {
    const p = pagination ?? {};
    const page = p.page ?? 1;
    const limit = p.limit ?? items.length;
    const total = p.total ?? items.length;
    return json({
        data: items,
        pagination: {
            page,
            limit,
            total,
            pages: Math.max(1, Math.ceil(total / Math.max(limit, 1)))
        }
    });
}

export function okOne<T>(item: T) {
    return json({ data: item });
}

export function created<T>(item: T) {
    return json({ data: item }, { status: 201 });
}

export function noContent() {
    return new Response(null, { status: 204 });
}

// ─── AI rate limiter (per identifier) ────────────────────────────────────────
// Hosted model calls can be expensive. We layer an extra
// throttle on top of the global rate limit in hooks.server.ts.  In-memory only
// per Q11b — single-replica deployment, no Redis.

interface AIBucket {
    count: number;
    resetAt: number;
}

const AI_LIMIT_WINDOW_MS = 60_000; // 1 minute
const AI_LIMIT_MAX = 12;           // 12 requests / minute / user

const aiBuckets = new Map<string, AIBucket>();

export function aiRateLimit(identifier: string) {
    const now = Date.now();
    const b = aiBuckets.get(identifier);

    if (!b || b.resetAt < now) {
        aiBuckets.set(identifier, { count: 1, resetAt: now + AI_LIMIT_WINDOW_MS });
        return;
    }

    b.count += 1;
    if (b.count > AI_LIMIT_MAX) {
        const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
        throw error(
            429,
            JSON.stringify({
                message: 'AI rate limit exceeded',
                retryAfter
            })
        );
    }
}

// Convenience: derive a stable identifier from the request.
export function rateLimitIdentifier(event: RequestEvent) {
    return event.locals.user?.id || event.getClientAddress();
}

// ─── ILIKE-safe wildcard escaping ────────────────────────────────────────────
// Escape `%` and `_` from user input so they don't act as wildcards.
// Use with `${escapeLike(input)}` inside a tagged template literal:
//   sql`WHERE col ILIKE ${'%' + escapeLike(q) + '%'} ESCAPE '\\'`
export function escapeLike(input: string): string {
    return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
