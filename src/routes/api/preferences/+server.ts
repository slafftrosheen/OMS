// src/routes/api/preferences/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/preferences - Get user preferences
 */
export const GET: RequestHandler = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) {
    // Return defaults for anonymous users
    return json({
      theme: 'DarkVim',
      locale: 'en',
      scale: 'normal',
      density: 'cozy',
      pdfZoom: 1.0,
      sidebarCollapsed: false,
      notificationsEnabled: true
    });
  }

  const userId = session.user.id;

  try {
    const { data: prefs, error } = await locals.supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "The result contains 0 rows"
       console.error('Failed to fetch preferences:', error);
       return json({ error: 'Failed to fetch preferences' }, { status: 500 });
    }

    if (!prefs) {
      // Create default preferences
      const { data: newPrefs, error: insertError } = await locals.supabase
        .from('user_preferences')
        .insert({
          user_id: userId,
          theme: 'DarkVim',
          locale: 'en',
          scale: 'normal',
          density: 'cozy',
          pdf_zoom: 1.0,
          sidebar_collapsed: false,
          notifications_enabled: true
        })
        .select()
        .single();

      if (insertError) {
          console.error('Failed to create default preferences:', insertError);
          return json({ error: 'Failed to create default preferences' }, { status: 500 });
      }

      return json({
        theme: newPrefs.theme,
        locale: newPrefs.locale,
        scale: newPrefs.scale,
        density: newPrefs.density,
        pdfZoom: newPrefs.pdf_zoom,
        sidebarCollapsed: newPrefs.sidebar_collapsed,
        notificationsEnabled: newPrefs.notifications_enabled
      });
    }

    return json({
      theme: prefs.theme,
      locale: prefs.locale,
      scale: prefs.scale,
      density: prefs.density,
      pdfZoom: prefs.pdf_zoom,
      sidebarCollapsed: prefs.sidebar_collapsed,
      notificationsEnabled: prefs.notifications_enabled,
      notificationSound: prefs.notification_sound ?? true,
      customSettings: {
        ...(prefs.custom_settings || {}),
        fontScale: prefs.font_scale ?? prefs.custom_settings?.fontScale ?? 1.0
      }
    });
  } catch (err) {
    console.error('Failed to fetch preferences:', err);
    return json({ error: 'Failed to fetch preferences' }, { status: 500 });
  }
};

/**
 * PUT /api/preferences - Update user preferences
 */
export const PUT: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const data = await request.json();

  try {
    const updates: any = {};
    if (data.theme !== undefined) updates.theme = data.theme;
    if (data.locale !== undefined) updates.locale = data.locale;
    if (data.scale !== undefined) updates.scale = data.scale;
    if (data.density !== undefined) updates.density = data.density;
    if (data.pdfZoom !== undefined) updates.pdf_zoom = data.pdfZoom;
    if (data.sidebarCollapsed !== undefined) updates.sidebar_collapsed = data.sidebarCollapsed;
    if (data.notificationsEnabled !== undefined) updates.notifications_enabled = data.notificationsEnabled;
    if (data.customSettings !== undefined) updates.custom_settings = data.customSettings;

    // Also keep font_scale and notification_sound in dedicated columns
    if (data.customSettings?.fontScale !== undefined) {
      updates.font_scale = data.customSettings.fontScale;
    }
    if (data.notificationSound !== undefined) {
      updates.notification_sound = data.notificationSound;
    }

    if (Object.keys(updates).length === 0) {
      return json({ error: 'No fields to update' }, { status: 400 });
    }

    // Try update first
    const { error: updateError, count } = await locals.supabase
        .from('user_preferences')
        .update(updates)
        .eq('user_id', userId);

    if (updateError) {
        throw updateError;
    }

    if (count === 0) {
        // Does not exist, create it
        const { error: insertError } = await locals.supabase
            .from('user_preferences')
            .insert({ user_id: userId, ...updates });

        if (insertError) throw insertError;
    }

    return json({ success: true });
  } catch (err) {
    console.error('Failed to update preferences:', err);
    return json({ error: 'Failed to update preferences' }, { status: 500 });
  }
};
