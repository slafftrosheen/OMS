// src/routes/api/healthz/+server.ts
import { text, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
    return text('OK', {
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
    });
};