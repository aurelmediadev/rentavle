import { applySubscriptionStatus, mercadoPagoProvider, recordSubscriptionPayment, verifyMercadoPagoSignature } from "@rentavle/billing";
import { db } from "@/lib/db";

/**
 * MercadoPago notifications for SaaS subscriptions. The body only says what
 * changed; the current state is always read back from MercadoPago's API, so a
 * forged or replayed notification can't change anything by itself. Signature:
 * MERCADOPAGO_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!secret || !token) return Response.json({ error: "not configured" }, { status: 503 });

  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as { type?: string; data?: { id?: string } };
  const dataId = url.searchParams.get("data.id") ?? body.data?.id ?? null;
  const valid = verifyMercadoPagoSignature(secret, {
    signature: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId,
  });
  if (!valid || !dataId) return Response.json({ error: "invalid signature" }, { status: 401 });

  const provider = mercadoPagoProvider(token);
  const type = url.searchParams.get("type") ?? body.type;
  const now = new Date();
  // Webhooks act for no user, so they use the admin client (see CLAUDE.md).
  if (type === "subscription_preapproval") {
    const sub = await provider.get(dataId);
    await applySubscriptionStatus(db.admin, { provider: "mercadopago", providerSubscriptionId: sub.id, status: sub.status, nextPaymentDate: sub.nextPaymentDate }, { provider, now });
  } else if (type === "subscription_authorized_payment") {
    const payment = await provider.getPayment(dataId);
    await recordSubscriptionPayment(db.admin, "mercadopago", payment);
    // A charge also moves the debit forward (or pauses it): refresh the subscription.
    const sub = await provider.get(payment.subscriptionId);
    await applySubscriptionStatus(db.admin, { provider: "mercadopago", providerSubscriptionId: sub.id, status: sub.status, nextPaymentDate: sub.nextPaymentDate }, { provider, now });
  }
  return Response.json({ ok: true });
}
