/**
 * Sends email through Resend in production, or Mailpit locally (it catches every
 * email; see supabase/config.toml). Both over HTTP, no SDK.
 */

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailMessage {
  from: EmailAddress;
  to: EmailAddress[];
  bcc?: string[];
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
  /** Our communication id, echoed back by delivery webhooks. */
  tags?: Record<string, string>;
}

export interface Mailer {
  readonly provider: 'resend' | 'mailpit';
  send(message: EmailMessage): Promise<{ id: string }>;
}

export class MailerError extends Error {}

const formatAddress = (a: EmailAddress) => (a.name ? `${a.name.replace(/["<>]/g, '')} <${a.email}>` : a.email);

export function resendMailer(apiKey: string, fetchImpl: typeof fetch = fetch): Mailer {
  return {
    provider: 'resend',
    async send(m) {
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: formatAddress(m.from),
          to: m.to.map(formatAddress),
          bcc: m.bcc?.length ? m.bcc : undefined,
          reply_to: m.replyTo ?? undefined,
          subject: m.subject,
          html: m.html,
          text: m.text,
          attachments: m.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })),
          tags: m.tags ? Object.entries(m.tags).map(([name, value]) => ({ name, value })) : undefined,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok || !body.id) throw new MailerError(body.message ?? `Resend respondió ${response.status}`);
      return { id: body.id };
    },
  };
}

export function mailpitMailer(baseUrl: string, fetchImpl: typeof fetch = fetch): Mailer {
  return {
    provider: 'mailpit',
    async send(m) {
      const response = await fetchImpl(`${baseUrl}/api/v1/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          From: { Email: m.from.email, Name: m.from.name ?? '' },
          To: m.to.map((a) => ({ Email: a.email, Name: a.name ?? '' })),
          Bcc: m.bcc ?? [],
          ReplyTo: m.replyTo ? [{ Email: m.replyTo }] : [],
          Subject: m.subject,
          HTML: m.html,
          Text: m.text,
          Attachments: (m.attachments ?? []).map((a) => ({ Filename: a.filename, Content: a.content.toString('base64') })),
          Tags: Object.values(m.tags ?? {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await response.json().catch(() => ({}))) as { ID?: string };
      if (!response.ok || !body.ID) throw new MailerError(`Mailpit respondió ${response.status}`);
      return { id: body.ID };
    },
  };
}

/**
 * RESEND_API_KEY → Resend. Without it, Mailpit (MAILPIT_URL, local default),
 * except in production, where a missing key is a configuration error.
 */
export function createMailer(env: Record<string, string | undefined> = process.env): Mailer {
  if (env.RESEND_API_KEY) return resendMailer(env.RESEND_API_KEY);
  if (env.NODE_ENV === 'production' && !env.MAILPIT_URL) {
    throw new MailerError('Falta RESEND_API_KEY para enviar emails');
  }
  return mailpitMailer(env.MAILPIT_URL ?? 'http://127.0.0.1:55324');
}

/** Sender address: the platform's domain, with the agency's name. */
export function senderAddress(agencyName: string, env: Record<string, string | undefined> = process.env): EmailAddress {
  return { email: env.EMAIL_FROM ?? 'avisos@rentavle.local', name: agencyName };
}
