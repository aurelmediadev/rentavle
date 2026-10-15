import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies a Resend delivery webhook (signed with Svix): HMAC-SHA256 of
 * "<id>.<timestamp>.<body>" with the endpoint secret ("whsec_<base64>").
 * Rejects timestamps more than 5 minutes away to stop replays.
 */
export function verifyResendWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now: Date = new Date(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now.getTime() / 1000 - seconds) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  // The header holds one or more "v1,<base64>" entries separated by spaces.
  return signature.split(' ').some((entry) => {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type DeliveryStatus = 'delivered' | 'bounced' | 'failed';

/** Resend event → communication status (other events are ignored). */
export function deliveryStatus(eventType: string): DeliveryStatus | null {
  switch (eventType) {
    case 'email.delivered':
      return 'delivered';
    case 'email.bounced':
    case 'email.complained':
      return 'bounced';
    case 'email.failed':
      return 'failed';
    default:
      return null;
  }
}
