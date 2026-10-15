import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Payment providers for the SaaS subscription. MercadoPago "preapproval"
 * (automatic debit, docs/05-arquitectura.md); a local simulator stands in for it
 * outside production until there are credentials.
 */

export type ProviderStatus = 'pending' | 'authorized' | 'paused' | 'cancelled';

export interface NewSubscription {
  /** Our subscription id, sent as external_reference. */
  reference: string;
  reason: string;
  payerEmail: string;
  /** Decimal string, e.g. "35000.00". */
  amount: string;
  currency: string;
  frequencyMonths: 1 | 12;
  backUrl: string;
}

export interface ProviderSubscription {
  id: string;
  status: ProviderStatus;
  reference: string | null;
  nextPaymentDate: Date | null;
}

export interface ProviderPayment {
  id: string;
  subscriptionId: string;
  status: string;
  amount: string;
  currency: string;
  date: Date | null;
}

export interface BillingProvider {
  readonly name: 'mercadopago' | 'simulated';
  create(input: NewSubscription): Promise<{ id: string; checkoutUrl: string }>;
  get(id: string): Promise<ProviderSubscription>;
  getPayment(id: string): Promise<ProviderPayment>;
  cancel(id: string): Promise<void>;
}

export class BillingError extends Error {}

const STATUSES: ProviderStatus[] = ['pending', 'authorized', 'paused', 'cancelled'];
const asStatus = (s: unknown): ProviderStatus => (STATUSES.includes(s as ProviderStatus) ? (s as ProviderStatus) : 'pending');

export function mercadoPagoProvider(accessToken: string, fetchImpl: typeof fetch = fetch): BillingProvider {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetchImpl(`https://api.mercadopago.com${path}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await response.json().catch(() => ({}))) as T & { message?: string };
    if (!response.ok) throw new BillingError(`MercadoPago: ${json.message ?? response.status}`);
    return json;
  }

  return {
    name: 'mercadopago',
    async create(input) {
      const created = await call<{ id: string; init_point: string }>('POST', '/preapproval', {
        reason: input.reason,
        external_reference: input.reference,
        payer_email: input.payerEmail,
        back_url: input.backUrl,
        status: 'pending',
        auto_recurring: {
          frequency: input.frequencyMonths,
          frequency_type: 'months',
          // The API takes a JSON number; our prices have at most two decimals.
          transaction_amount: Number(input.amount),
          currency_id: input.currency,
        },
      });
      return { id: created.id, checkoutUrl: created.init_point };
    },
    async get(id) {
      const p = await call<{ id: string; status: string; external_reference?: string; next_payment_date?: string }>('GET', `/preapproval/${encodeURIComponent(id)}`);
      return {
        id: p.id,
        status: asStatus(p.status),
        reference: p.external_reference ?? null,
        nextPaymentDate: p.next_payment_date ? new Date(p.next_payment_date) : null,
      };
    },
    async getPayment(id) {
      const p = await call<{ id: number | string; preapproval_id: string; status?: string; payment?: { status?: string }; transaction_amount: number; currency_id: string; date_created?: string }>(
        'GET',
        `/authorized_payments/${encodeURIComponent(id)}`,
      );
      return {
        id: String(p.id),
        subscriptionId: p.preapproval_id,
        status: p.payment?.status ?? p.status ?? 'pending',
        amount: p.transaction_amount.toFixed(2),
        currency: p.currency_id,
        date: p.date_created ? new Date(p.date_created) : null,
      };
    },
    async cancel(id) {
      await call('PUT', `/preapproval/${encodeURIComponent(id)}`, { status: 'cancelled' });
    },
  };
}

/** Local stand-in: "checkout" is a page of the app where the admin approves or rejects. */
export function simulatedProvider(siteUrl: string): BillingProvider {
  return {
    name: 'simulated',
    async create() {
      const id = `sim_${randomUUID()}`;
      return { id, checkoutUrl: `${siteUrl}/suscripcion/simulador/${id}` };
    },
    async get(id) {
      return { id, status: 'pending', reference: null, nextPaymentDate: null };
    },
    async getPayment(id) {
      throw new BillingError(`El simulador no tiene pagos (${id})`);
    },
    async cancel() {},
  };
}

/** MercadoPago with MERCADOPAGO_ACCESS_TOKEN; the simulator only outside production. */
export function createBillingProvider(env: Record<string, string | undefined>, siteUrl: string): BillingProvider {
  if (env.MERCADOPAGO_ACCESS_TOKEN) return mercadoPagoProvider(env.MERCADOPAGO_ACCESS_TOKEN);
  if (env.NODE_ENV === 'production') throw new BillingError('Falta MERCADOPAGO_ACCESS_TOKEN para cobrar suscripciones');
  return simulatedProvider(siteUrl);
}

/**
 * MercadoPago webhook signature: header x-signature "ts=…,v1=…", where v1 is the
 * HMAC-SHA256 (hex) of "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" with the
 * webhook secret. Rejects timestamps more than 5 minutes away.
 */
export function verifyMercadoPagoSignature(
  secret: string,
  input: { signature: string | null; requestId: string | null; dataId: string | null },
  now: Date = new Date(),
): boolean {
  if (!input.signature || !input.dataId) return false;
  const parts = Object.fromEntries(input.signature.split(',').map((p) => p.trim().split('=') as [string, string]));
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^[0-9a-f]+$/i.test(v1)) return false;
  // ts comes in milliseconds in current notifications (seconds in older ones).
  const tsMs = ts.length > 11 ? Number(ts) : Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(now.getTime() - tsMs) > 5 * 60_000) return false;
  const dataId = /^[a-z0-9]+$/i.test(input.dataId) ? input.dataId.toLowerCase() : input.dataId;
  const manifest = `id:${dataId};${input.requestId ? `request-id:${input.requestId};` : ''}ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  const given = Buffer.from(v1, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
