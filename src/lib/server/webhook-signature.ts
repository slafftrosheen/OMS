import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-SHA256 signing for outbound webhooks.
 *
 * The receiver verifies by computing the same HMAC using the shared secret
 * and comparing in constant time:
 *
 *     const expected = computeWebhookSignature(secret, body, timestamp);
 *     if (!timingSafeEqual(received, expected)) reject;
 *
 * Headers we attach to every outgoing webhook:
 *   X-OMS-Timestamp: 1745595830                  (unix seconds at sign time)
 *   X-OMS-Signature: sha256=<hex hmac digest>    (signed payload = ts + "." + body)
 */

const SCHEME = 'sha256';

export function computeWebhookSignature(secret: string, body: string, timestamp: number): string {
    const signedPayload = `${timestamp}.${body}`;
    const digest = createHmac('sha256', secret).update(signedPayload).digest('hex');
    return `${SCHEME}=${digest}`;
}

export function signWebhook(secret: string, body: string) {
    const timestamp = Math.floor(Date.now() / 1000);
    return {
        timestamp,
        signature: computeWebhookSignature(secret, body, timestamp)
    };
}

/**
 * Verify a signature and reject replays older than `toleranceSeconds`.
 * Returns true on valid, false on any mismatch / stale.
 */
export function verifyWebhookSignature(
    secret: string,
    body: string,
    receivedTimestamp: number | string,
    receivedSignature: string,
    toleranceSeconds = 300
): boolean {
    const ts = typeof receivedTimestamp === 'string' ? parseInt(receivedTimestamp, 10) : receivedTimestamp;
    if (!Number.isFinite(ts)) return false;

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > toleranceSeconds) return false;

    const expected = computeWebhookSignature(secret, body, ts);
    const a = Buffer.from(expected);
    const b = Buffer.from(receivedSignature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}
