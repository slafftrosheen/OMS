// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/auth/session';

export const handle: Handle = async ({ event, resolve }) => {
  // Get user from session cookie
  const user = await getSessionUser(event.cookies);
  
  if (user) {
    // Set locals.user with proper structure for API routes
    event.locals.user = {
      id: user.id,
      username: user.username,
      name: user.displayName,
      displayName: user.displayName,
      primarySection: user.primarySection,
      sections: user.sections,
      roles: user.roles,
      stations: user.stations,
      // Computed role property for backward compatibility with API routes
      get role() {
        // Return highest role (SuperAdmin > StationLead > Operator > Viewer)
        const roleHierarchy = ['SuperAdmin', 'StationLead', 'Operator', 'Viewer'];
        const userRoles = Object.values(this.roles);
        for (const role of roleHierarchy) {
          if (userRoles.includes(role)) return role;
        }
        return 'Viewer';
      }
    };
  }

  const response = await resolve(event);
  return response;
};
