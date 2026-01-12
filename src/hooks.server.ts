// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { createSupabaseServerClient } from '@supabase/auth-helpers-sveltekit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createSupabaseServerClient({
    supabaseUrl: PUBLIC_SUPABASE_URL,
    supabaseKey: PUBLIC_SUPABASE_ANON_KEY,
    event
  });

  event.locals.getSession = async () => {
    const {
      data: { session }
    } = await event.locals.supabase.auth.getSession();
    return session;
  };
  
  const session = await event.locals.getSession();

  if (session?.user) {
    // Fetch user profile from the database
    const { data: userProfile } = await event.locals.supabase
      .from('users')
      .select('id, username, display_name, primary_section, sections, roles, stations')
      .eq('id', session.user.id)
      .single();

    if (userProfile) {
      // Set locals.user with proper structure for API routes
      event.locals.user = {
        id: userProfile.id,
        username: userProfile.username,
        name: userProfile.display_name,
        displayName: userProfile.display_name,
        primarySection: userProfile.primary_section,
        sections: userProfile.sections,
        roles: userProfile.roles,
        stations: userProfile.stations,
        // Computed role property for backward compatibility with API routes
        get role() {
          // Return highest role (SuperAdmin > StationLead > Operator > Viewer)
          const roleHierarchy = ['SuperAdmin', 'StationLead', 'Operator', 'Viewer'];
          const userRoles = Object.values(this.roles as Record<string, string>);
          for (const role of roleHierarchy) {
            if (userRoles.includes(role)) return role;
          }
          return 'Viewer';
        }
      };
    }
  }

  return resolve(event, {
    /**
     * Supabase needs the content-range header to be exposed to the browser.
     * @see https://supabase.com/docs/guides/auth/server-side/oauth-with-pkce-flow-for-ssr
     */
    filterSerializedResponseHeaders(name) {
      return name === 'content-range';
    }
  });
};
