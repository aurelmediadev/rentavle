import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TEMPLATES,
  TYPE_VARIABLES,
  communicationTypes,
  deliveryStatus,
  emailHtml,
  mailpitMailer,
  renderTemplate,
  resendMailer,
  unknownVariables,
  verifyResendWebhook,
} from './index';

describe('templates', () => {
  it('fills variables and blanks unknown ones', () => {
    expect(renderTemplate('Hola {{NOMBRE}}, {{ NUMERO }}{{OTRA}}.', { NOMBRE: 'Ana', NUMERO: '12' })).toBe('Hola Ana, 12.');
  });

  it('only uses the variables each type provides', () => {
    for (const type of communicationTypes) {
      for (const channel of ['email', 'whatsapp'] as const) {
        const t = DEFAULT_TEMPLATES[type][channel];
        expect(unknownVariables(type, `${t.subject ?? ''} ${t.body}`), `${type}/${channel}`).toEqual([]);
      }
      expect(Object.keys(TYPE_VARIABLES[type]).length).toBeGreaterThan(0);
    }
    expect(unknownVariables('receipt', '{{NOMBRE}} {{DIAS_MORA}}')).toEqual(['DIAS_MORA']);
  });
});

describe('layout', () => {
  it('escapes content, keeps paragraphs and links URLs', () => {
    const html = emailHtml({ agencyName: 'A & B <Propiedades>', body: 'Hola <b>Ana</b>\nlinea 2\n\nLink: https://x.test/d/abc' });
    expect(html).toContain('A &amp; B &lt;Propiedades&gt;');
    expect(html).toContain('Hola &lt;b&gt;Ana&lt;/b&gt;<br>linea 2');
    expect(html).toContain('<a href="https://x.test/d/abc"');
    expect(html).not.toContain('<b>Ana</b>');
  });
});

describe('mailers', () => {
  const message = {
    from: { email: 'avisos@rentavle.com', name: 'Inmobiliaria "Demo"' },
    to: [{ email: 'ana@example.com', name: 'Ana' }],
    bcc: ['copia@demo.com'],
    replyTo: 'info@demo.com',
    subject: 'Recibo',
    html: '<p>Hola</p>',
    text: 'Hola',
    attachments: [{ filename: 'recibo.pdf', content: Buffer.from('%PDF-') }],
    tags: { communication: 'c1' },
  };

  it('sends through Resend', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 're_1' }), { status: 200 }));
    await expect(resendMailer('key', fetchMock).send(message)).resolves.toEqual({ id: 're_1' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: 'Inmobiliaria Demo <avisos@rentavle.com>',
      to: ['Ana <ana@example.com>'],
      bcc: ['copia@demo.com'],
      reply_to: 'info@demo.com',
      attachments: [{ filename: 'recibo.pdf', content: Buffer.from('%PDF-').toString('base64') }],
      tags: [{ name: 'communication', value: 'c1' }],
    });
  });

  it('reports provider errors', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: 'invalid from' }), { status: 422 }));
    await expect(resendMailer('key', fetchMock).send(message)).rejects.toThrow('invalid from');
    const mailpit = vi.fn(async () => new Response('nope', { status: 500 }));
    await expect(mailpitMailer('http://mailpit', mailpit).send(message)).rejects.toThrow('Mailpit respondió 500');
  });
});

describe('Resend webhooks', () => {
  const secret = `whsec_${Buffer.from('super-secret-key').toString('base64')}`;
  const body = '{"type":"email.delivered"}';
  const now = new Date('2026-10-15T12:00:00Z');
  const timestamp = String(now.getTime() / 1000);
  const sign = (b: string) =>
    `v1,${createHmac('sha256', Buffer.from('super-secret-key')).update(`msg_1.${timestamp}.${b}`).digest('base64')}`;

  it('accepts a valid signature and rejects tampering, replays and missing headers', () => {
    expect(verifyResendWebhook(secret, { id: 'msg_1', timestamp, signature: `v1,bad ${sign(body)}` }, body, now)).toBe(true);
    expect(verifyResendWebhook(secret, { id: 'msg_1', timestamp, signature: sign(body) }, '{"type":"email.bounced"}', now)).toBe(false);
    expect(verifyResendWebhook(secret, { id: 'msg_1', timestamp, signature: sign(body) }, body, new Date(now.getTime() + 600_000))).toBe(false);
    expect(verifyResendWebhook(secret, { id: null, timestamp, signature: sign(body) }, body, now)).toBe(false);
  });

  it('maps events to statuses', () => {
    expect(deliveryStatus('email.delivered')).toBe('delivered');
    expect(deliveryStatus('email.bounced')).toBe('bounced');
    expect(deliveryStatus('email.opened')).toBeNull();
  });
});
