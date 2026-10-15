import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, eq } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { formatYearMonth } from "@rentavle/domain";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Card, CardContent } from "@/components/ui/card";
import { asUser, getActiveMembership } from "@/lib/auth";
import { currentMonthIn, formatMonth, todayIn } from "@/lib/dates";
import { formatAddress } from "@/lib/format";
import { recordPayment } from "../payment-actions";
import { paymentFormData } from "../payments-data";
import { PaymentForm } from "./payment-form";

export const metadata: Metadata = { title: "Registrar cobro · Rentavle" };

export default function CollectPage({ params }: PageProps<"/contratos/[numero]/cobrar">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Collect params={params} />
    </Suspense>
  );
}

async function Collect({ params }: Pick<PageProps<"/contratos/[numero]/cobrar">, "params">) {
  const number = Number((await params).numero);
  if (!Number.isInteger(number) || number < 1) notFound();
  const { organizationId, timezone } = await getActiveMembership();
  const found = await asUser(async (tx) => {
    const [row] = await tx
      .select({ id: schema.contracts.id, property: schema.properties })
      .from(schema.contracts)
      .innerJoin(schema.properties, eq(schema.properties.id, schema.contracts.propertyId))
      .where(and(eq(schema.contracts.organizationId, organizationId), eq(schema.contracts.number, number)));
    return row;
  });
  if (!found) notFound();
  const data = await paymentFormData(found.id);
  if (!data) notFound();
  const { contract, open, accounts } = data;

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader
        title="Registrar cobro"
        description={`${formatAddress(found.property)} · Contrato #${contract.number}`}
        back={{ href: `/contratos/${contract.number}`, label: "Volver al contrato" }}
      />
      <Card>
        <CardContent>
          {open.length === 0 ? (
            <p className="text-muted-foreground text-sm">El inquilino no tiene deudas pendientes.</p>
          ) : (
            <PaymentForm
              // Next keeps visited pages mounted: a new set of open debts must reset the
              // form's local state (selection, amounts) instead of reusing stale ids.
              key={open.map((c) => `${c.id}:${c.outstanding}`).join("|")}
              action={recordPayment.bind(null, contract.id, contract.number)}
              contract={{
                number: contract.number,
                currency: contract.currency,
                lateInterestDailyPct: contract.lateInterestDailyPct,
                lateInterestFrom: contract.lateInterestFrom,
                defaultMethod: contract.collectionMethod,
              }}
              charges={open.map((c) => ({
                ...c,
                label:
                  c.type === "rent"
                    ? `Alquiler ${formatMonth(c.periodMonth)}`
                    : c.type === "recurring"
                      ? `${c.title} ${formatMonth(c.periodMonth)}`
                      : c.title,
              }))}
              accounts={accounts}
              today={todayIn(timezone)}
              currentMonth={formatYearMonth(currentMonthIn(timezone))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
