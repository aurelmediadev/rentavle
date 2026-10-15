import { createMailer } from "@rentavle/emails";
import { sendCommunications } from "@rentavle/jobs";
import { isAuthorizedCron } from "@/lib/cron";
import { db } from "@/lib/db";

/**
 * Daily job (after /api/cron/indices creates the month's debts): sends the
 * automatic notices each agency turned on. Idempotent: notices have dedupe keys.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  // Jobs act for no user, so they use the admin client (see CLAUDE.md, "Base de datos").
  const result = await sendCommunications(db.admin, { now: new Date(), mailer: createMailer() });
  return Response.json(result);
}
