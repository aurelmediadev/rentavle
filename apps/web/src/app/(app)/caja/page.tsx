import type { Metadata } from "next";
import Link from "next/link";
import Decimal from "decimal.js";
import { Suspense } from "react";
import { Landmark, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveMembership } from "@/lib/auth";
import { todayIn } from "@/lib/dates";
import { formatMoney } from "@/lib/numbers";
import { ArchiveCashAccountButton, CashAccountDialog, ManualMovementDialog } from "./cash-dialogs";
import { listCashAccounts } from "./data";

export const metadata: Metadata = { title: "Caja · Rentavle" };

export default function CashPage() {
  return (
    <div className="grid gap-6">
      <Suspense fallback={<PageLoading />}>
        <Boxes />
      </Suspense>
    </div>
  );
}

async function Boxes() {
  const [{ role, timezone }, accounts] = await Promise.all([getActiveMembership(), listCashAccounts()]);
  const today = todayIn(timezone);
  const boxes = accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }));
  const defaultCurrency = accounts.find((a) => a.isDefault)?.currency ?? accounts[0]?.currency ?? "ARS";

  // Totals per currency: what the agency holds right now.
  const totals = new Map<string, string[]>();
  for (const a of accounts) totals.set(a.currency, [...(totals.get(a.currency) ?? []), a.balance]);

  return (
    <>
      <PageHeader
        title="Caja"
        description="El dinero de la administración en cada caja y cuenta, calculado desde los asientos contables."
        actions={
          <div className="flex flex-wrap gap-2">
            <ManualMovementDialog kind="manual_income" boxes={boxes} today={today} />
            <ManualMovementDialog kind="manual_expense" boxes={boxes} today={today} />
            <ManualMovementDialog kind="transfer" boxes={boxes} today={today} />
            {role === "admin" && <CashAccountDialog defaultCurrency={defaultCurrency} />}
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => {
          const Icon = a.type === "bank" ? Landmark : Wallet;
          return (
            <Card key={a.id} className="gap-3">
              <CardHeader className="flex items-start justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="text-muted-foreground size-4" />
                  <Link href={`/caja/${a.id}`} className="hover:underline">
                    {a.name}
                  </Link>
                </CardTitle>
                {a.isDefault && <Badge variant="secondary">Principal</Badge>}
              </CardHeader>
              <CardContent className="grid gap-3">
                <p className="text-2xl font-semibold tabular-nums" aria-label={`Saldo de ${a.name}`}>
                  {formatMoney(a.balance, a.currency)}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/caja/${a.id}`} className="text-primary text-sm hover:underline">
                    Ver libro de caja
                  </Link>
                  {role === "admin" && !a.isDefault && <ArchiveCashAccountButton cashAccountId={a.id} />}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {totals.size > 0 && accounts.length > 1 && (
        <p className="text-muted-foreground text-sm">
          Total en cajas y cuentas:{" "}
          {[...totals.entries()]
            .map(([currency, balances]) => formatMoney(balances.reduce((t, b) => t.plus(b), new Decimal(0)).toFixed(2), currency))
            .join(" · ")}
        </p>
      )}
    </>
  );
}

