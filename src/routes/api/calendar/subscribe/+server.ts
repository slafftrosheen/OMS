// src/routes/api/calendar/subscribe/+server.ts
import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CalendarService } from '$lib/server/calendar/CalendarService';

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw svelteError(401, 'Unauthorized');
    }

    const { type } = await request.json();

    if (!['orders', 'station', 'loading'].includes(type)) {
        throw svelteError(400, 'Invalid calendar type');
    }

    const calendarService = new CalendarService(locals.supabase);

    try {
        const token = await calendarService.createSubscriptionToken(user.id, type);
        const subscriptionUrl = `${process.env.BASE_URL || 'http://localhost:5173'}/api/calendar/feed/${token}.ics`;

        return json({
            success: true,
            token,
            subscriptionUrl,
            instructions: {
                google: `Add this URL to Google Calendar: ${subscriptionUrl}`,
                apple: `Subscribe in Apple Calendar using: ${subscriptionUrl}`,
                outlook: `Add Internet Calendar in Outlook: ${subscriptionUrl}`
            }
        });
    } catch (err) {
        throw svelteError(500, 'Failed to create calendar subscription');
    }
};