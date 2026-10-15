import { timingSafeEqual } from "node:crypto";
import { applyRentUpdates, fetchIndexes, generateCharges } from "@rentavle/jobs";
import { db } from "@/lib/db";

/**
 * Daily job: download official index values, calculate due rent updates and
 * create the month's debts.
 * Called by the scheduler (Vercel Cron) with `Authorization: Bearer $CRON_SECRET`.
 * Both steps are idempotent, so retries are safe.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // Jobs act for no user, so they use the admin client (see CLAUDE.md, "Base de datos").
  const indexes = await fetchIndexes(db.admin, now.toISOString().slice(0, 10));
  const updates = await applyRentUpdates(db.admin, { now });
  // After updates, so this month's rent debts use the new amounts.
  const charges = await generateCharges(db.admin, { now });
  const failed = indexes.filter((r) => r.error);
  return Response.json({ indexes, updates, charges }, { status: failed.length ? 207 : 200 });
}
