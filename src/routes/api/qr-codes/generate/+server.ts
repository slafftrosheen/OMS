// src/routes/api/qr-codes/generate/+server.ts
import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { QRCodeService } from '$lib/server/qr/QRCodeService';

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw svelteError(401, 'Unauthorized');
    }

    const { orderId, type, station } = await request.json();

    if (!orderId) {
        throw svelteError(400, 'Order ID required');
    }

    const qrService = new QRCodeService(locals.supabase);

    try {
        let result;

        switch (type) {
            case 'order':
                result = await qrService.generateOrderQR(orderId, user.id);
                break;
            case 'station':
                if (!station) {
                    throw svelteError(400, 'Station required for station QR code');
                }
                result = await qrService.generateStationQR(orderId, station, user.id);
                break;
            case 'sheet':
                result = await qrService.generateOrderQRSheet(orderId, user.id);
                break;
            default:
                throw svelteError(400, 'Invalid QR code type');
        }

        return json({
            success: true,
            data: result
        });

    } catch (err) {
        throw svelteError(500, 'QR code generation failed');
    }
};