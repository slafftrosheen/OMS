/**
 * Admin section guard.
 *
 * Hooks already block unauthenticated requests on /api/* but page routes are
 * not in that allow-list — without a server-side check, a non-admin who knows
 * the URL gets through.  This load runs on every navigation under /admin/* and
 * forces a 403 unless `locals.user` carries an admin role.
 *
 * `roles.admin` (the JSONB map) is the canonical signal; the new top-level
 * `role` column added in Phase 1 is also accepted for new code.
 */

import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
    const user = locals.user;
    if (!user) {
        throw redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
    }

    const roles = (user as any).roles ?? {};
    const role  = (user as any).role ?? null;
    const isAdmin = roles.admin === true || role === 'admin';

    if (!isAdmin) {
        throw error(403, 'Admin role required to access this section.');
    }

    return { user } as unknown as App.PageData;
};
