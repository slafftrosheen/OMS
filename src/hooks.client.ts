// src/hooks.client.ts
import { initSentry } from '$lib/monitoring/sentry';
import * as Sentry from '@sentry/sveltekit';
import type { HandleClientError } from '@sveltejs/kit';

// Initialize Sentry on the client
initSentry();

const customHandleError: HandleClientError = ({ error, event }) => {
    console.error('Client Error:', error);

    // We could return a custom message or error ID here if needed
    return {
        message: 'An unexpected client-side error occurred.',
        errorId: (error as any)?.errorId || crypto.randomUUID()
    };
};

export const handleError = Sentry.handleErrorWithSentry(customHandleError);
