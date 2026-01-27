// src/routes/api/calendar/feed/[token]/+server.ts
import { error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CalendarService } from '$lib/server/calendar/CalendarService';

export const GET: RequestHandler = async ({ params, locals }) => {
    const token = params.token.replace('.ics', '');

    const calendarService = new CalendarService(locals.supabase);

    try {
        const subscription = await calendarService.getCalendarByToken(token);

        let icalContent: string;

        switch (subscription.type) {
            case 'orders':
                icalContent = await calendarService.generateOrderCalendar(subscription.userId);
                break;
            case 'station':
                if (!subscription.station) {
                    throw svelteError(400, 'Station not specified');
                }
                icalContent = await calendarService.generateStationCalendar(subscription.station);
                break;
            case 'loading':
                icalContent = await calendarService.generateLoadingCalendar();
                break;
            default:
                throw svelteError(400, 'Invalid calendar type');
        }

        return new Response(icalContent, {
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
                'Content-Disposition': 'inline; filename="oms-calendar.ics"',
                'Cache-Control': 'no-cache, must-revalidate'
            }
        });

    } catch (err) {
        throw svelteError(404, 'Calendar not found or expired');
    }
};