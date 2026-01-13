// src/routes/api/calendar/capacity/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/calendar/capacity - Get capacity configuration
 */
export const GET: RequestHandler = async ({ locals }) => {
  try {
    const { data: config, error: configError } = await locals.supabase
        .from('capacity_config')
        .select('id, default_capacity')
        .eq('config_type', 'loading')
        .eq('is_active', true)
        .single();

    // If not found, create default
    let defaultConfig = config;
    if (!config) {
        const { data: newConfig } = await locals.supabase
            .from('capacity_config')
            .upsert({ config_type: 'loading', default_capacity: 10 }, { onConflict: 'config_type' })
            .select()
            .single();
        defaultConfig = newConfig;
    }

    const defaultCapacity = defaultConfig?.default_capacity || 10;
    const configId = defaultConfig?.id;

    // Get custom day capacities
    const customCapacities: Record<string, number> = {};
    if (configId) {
        const { data: days } = await locals.supabase
            .from('day_capacities')
            .select('date, capacity')
            .eq('config_id', configId);

        if (days) {
            for (const row of days) {
                // Ensure date string format
                customCapacities[row.date] = row.capacity;
            }
        }
    }

    return json({
      defaultCapacity,
      customCapacities
    });
  } catch (err) {
    console.error('Failed to fetch capacity config:', err);
    return json({ defaultCapacity: 10, customCapacities: {} });
  }
};

/**
 * PUT /api/calendar/capacity - Update capacity configuration
 */
export const PUT: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();

  try {
    // Get or create config
    const { data: config } = await locals.supabase
        .from('capacity_config')
        .upsert({ config_type: 'loading', default_capacity: 10 }, { onConflict: 'config_type' })
        .select('id')
        .single();

    if (!config) throw new Error('Failed to get config');

    // Update default capacity
    if (data.defaultCapacity !== undefined) {
      await locals.supabase
        .from('capacity_config')
        .update({ default_capacity: data.defaultCapacity, updated_at: new Date().toISOString() })
        .eq('id', config.id);
    }

    // Update specific day
    if (data.date && data.capacity !== undefined) {
        // Upsert day capacity
        // Need to ensure unique constraint on (config_id, date) exists for upsert to work properly
        await locals.supabase
            .from('day_capacities')
            .upsert({
                config_id: config.id,
                date: data.date,
                capacity: data.capacity
            }, { onConflict: 'config_id, date' });
    }

    return json({ success: true });
  } catch (err) {
    console.error('Failed to update capacity config:', err);
    return json({ error: 'Failed to update capacity' }, { status: 500 });
  }
};

/**
 * DELETE /api/calendar/capacity - Reset capacity configuration
 */
export const DELETE: RequestHandler = async ({ locals }) => {
  try {
    const { data: config } = await locals.supabase
        .from('capacity_config')
        .select('id')
        .eq('config_type', 'loading')
        .single();

    if (config) {
        await locals.supabase
            .from('capacity_config')
            .update({ default_capacity: 10 })
            .eq('id', config.id);

        await locals.supabase
            .from('day_capacities')
            .delete()
            .eq('config_id', config.id);
    }

    return json({ success: true });
  } catch (err) {
    console.error('Failed to reset capacity config:', err);
    return json({ error: 'Failed to reset capacity' }, { status: 500 });
  }
};
