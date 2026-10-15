import { eq } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { deliveryStatus, verifyResendWebhook } from "@rentavle/emails";
import { db } from "@/lib/db";

/**
 * Delivery events from Resend (delivered, bounced...). Signed with Svix; the
 * secret is RESEND_WEBHOOK_SECRET. Updates the communication by provider id.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "not configured" }, { status: 503 });
  const body = await request.text();
  const valid = verifyResendWebhook(
    secret,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    body,
  );
  if (!valid) return Response.json({ error: "invalid signature" }, { status: 401 });

  const event = JSON.parse(body) as { type?: string; data?: { email_id?: string } };
  const status = deliveryStatus(event.type ?? "");
  const providerId = event.data?.email_id;
  if (status && providerId) {
    // Webhooks act for no user, so they use the admin client (see CLAUDE.md).
    await db.admin
      .update(schema.communications)
      .set({ status, error: status === "delivered" ? null : `Resend: ${event.type}` })
      .where(eq(schema.communications.providerMessageId, providerId));
  }
  return Response.json({ ok: true });
}
