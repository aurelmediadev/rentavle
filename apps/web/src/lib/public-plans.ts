import "server-only";
import { cacheLife } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { db } from "@/lib/db";

/** Active plans of a country for the public site, read as an anonymous visitor and cached for hours. */
export async function publicPlans(countryCode: string) {
  "use cache";
  cacheLife("hours");
  return db.asAnon((tx) =>
    tx
      .select({
        code: schema.plans.code,
        name: schema.plans.name,
        maxActiveContracts: schema.plans.maxActiveContracts,
        monthlyPrice: schema.plans.monthlyPrice,
        annualPrice: schema.plans.annualPrice,
        currency: schema.plans.currency,
        extraBlockContracts: schema.plans.extraBlockContracts,
        extraBlockPrice: schema.plans.extraBlockPrice,
      })
      .from(schema.plans)
      .where(and(eq(schema.plans.countryCode, countryCode), eq(schema.plans.isActive, true)))
      .orderBy(asc(schema.plans.sortOrder)),
  );
}
