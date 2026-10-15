import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Scheduled jobs call with `Authorization: Bearer $CRON_SECRET` (Vercel Cron). */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return Boolean(secret) && given.length === secret!.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret!));
}
