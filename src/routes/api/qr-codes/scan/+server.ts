// src/routes/api/qr-codes/scan/+server.ts
import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { QRCodeService } from '$lib/server/qr/QRCodeService';

export const POST: RequestHandler = async ({ request, locals }) => {
    const user = locals.user;
    if (!user) {
        throw svelteError(401, 'Unauthorized');
    }

    const { content } = await request.json();

    if (!content) {
        throw svelteError(400, 'QR code content required');
    }

    const qrService = new QRCodeService(locals.supabase);

    try {
        const validation = await qrService.validateQRCode(content, user.id);

        if (!validation.valid) {
            throw svelteError(400, 'Invalid or expired QR code');
        }

        return json({
            success: true,
            data: validation
        });

    } catch (err) {
        if (err instanceof Response) {
            throw err;
        }
        throw svelteError(500, 'QR code validation failed');
    }
};