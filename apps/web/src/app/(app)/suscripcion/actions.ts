"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { BillingError, applySubscriptionStatus, recordSubscriptionPayment } from "@rentavle/billing";
import { schema } from "@rentavle/db";
import { subscriptionAmount } from "@rentavle/domain";
import { asUser, requireRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { FormState } from "@/lib/forms";
import { billingProvider, getSubscriptionState } from "@/lib/subscription";

const { subscriptions } = schema;

/** Starts the automatic debit for a plan and sends the admin to authorize it. */
export async function startSubscription(planCode: string, cycle: "monthly" | "annual"): Promise<FormState> {
  await requireRole("admin");
  const state = await getSubscriptionState();
  const plan = state.plans.find((p) => p.code === planCode);
  if (!plan || (cycle !== "monthly" && cycle !== "annual")) return { message: "Plan inválido" };

  // The biggest plan grows in blocks; smaller ones must fit the current contracts.
  const over = state.activeContracts - plan.maxActiveContracts;
  const extraBlocks = over > 0 && plan.extraBlockContracts ? Math.ceil(over / plan.extraBlockContracts) : 0;
  if (over > 0 && !plan.extraBlockContracts) {
    return { message: `Tenés ${state.activeContracts} contratos activos: elegí un plan más grande.` };
  }
  const amount = subscriptionAmount(plan, cycle, extraBlocks);

  let provider: ReturnType<typeof billingProvider>;
  try {
    provider = billingProvider();
  } catch (error) {
    // Production before the MercadoPago credentials are loaded.
    if (error instanceof BillingError) return { message: "Todavía no podemos cobrar suscripciones en línea: escribinos a hola@rentavle.com y te activamos el plan." };
    throw error;
  }
  const id = randomUUID();
  const user = await requireUser();
  const created = await provider.create({
    reference: id,
    reason: `Rentavle · Plan ${plan.name} (${cycle === "monthly" ? "mensual" : "anual"})`,
    payerEmail: user.email,
    amount,
    currency: plan.currency,
    frequencyMonths: cycle === "monthly" ? 1 : 12,
    backUrl: `${env.siteUrl}/suscripcion?volver=1`,
  });
  await asUser((tx) =>
    tx.insert(subscriptions).values({
      id,
      organizationId: state.org.id,
      planId: plan.id,
      cycle,
      extraBlocks,
      amount,
      currency: plan.currency,
      provider: provider.name,
      providerSubscriptionId: created.id,
      checkoutUrl: created.checkoutUrl,
      payerEmail: user.email,
      createdBy: user.id,
    }),
  );
  redirect(created.checkoutUrl);
}

/**
 * Cancels the automatic debit. The provider confirms it and we apply the same
 * update its webhook would (billing sync runs as server code, like the webhook).
 */
export async function cancelSubscription(): Promise<FormState> {
  const { organizationId } = await requireRole("admin");
  const [current] = await asUser((tx) =>
    tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.organizationId, organizationId), inArray(subscriptions.status, ["authorized", "paused"])))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1),
  );
  if (!current?.providerSubscriptionId) return { message: "No tenés una suscripción activa" };
  const provider = billingProvider();
  await provider.cancel(current.providerSubscriptionId);
  await applySubscriptionStatus(db.admin, { provider: current.provider, providerSubscriptionId: current.providerSubscriptionId, status: "cancelled" }, { provider, now: new Date() });
  revalidatePath("/", "layout");
  return { ok: true, message: "Suscripción cancelada" };
}

function nextDebit(from: Date, cycle: "monthly" | "annual") {
  const next = new Date(from);
  next.setUTCMonth(next.getUTCMonth() + (cycle === "monthly" ? 1 : 12));
  return next;
}

/**
 * Simulator only (no MercadoPago credentials, never in production): the admin
 * approves or rejects the debit, and we apply it as MercadoPago's webhook would.
 */
export async function simulateDecision(providerSubscriptionId: string, decision: "authorized" | "cancelled") {
  const provider = billingProvider();
  if (provider.name !== "simulated") throw new Error("El simulador está desactivado");
  const { organizationId } = await requireRole("admin");
  const [sub] = await asUser((tx) =>
    tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.organizationId, organizationId), eq(subscriptions.providerSubscriptionId, providerSubscriptionId))),
  );
  if (!sub) throw new Error("Suscripción inexistente");
  const now = new Date();
  await applySubscriptionStatus(db.admin, { provider: "simulated", providerSubscriptionId, status: decision, nextPaymentDate: decision === "authorized" ? nextDebit(now, sub.cycle) : null }, { provider, now });
  if (decision === "authorized") {
    await recordSubscriptionPayment(db.admin, "simulated", { id: `simpay_${randomUUID()}`, subscriptionId: providerSubscriptionId, status: "approved", amount: sub.amount, currency: sub.currency, date: now });
  }
  revalidatePath("/", "layout");
  redirect("/suscripcion?volver=1");
}
