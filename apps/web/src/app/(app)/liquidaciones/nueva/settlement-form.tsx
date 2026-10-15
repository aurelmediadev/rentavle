"use client";

import Link from "next/link";
import { useActionState, useId, useMemo, useState } from "react";
import Decimal from "decimal.js";
import { FormMessage, SubmitButton, TextareaField } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type FormState, initialFormState } from "@/lib/forms";
import { formatMoney } from "@/lib/numbers";
import { type OwnerDebt, type PendingItem, buildSettlementPlan } from "../settlement-plan";

const RECEIVED_NOTE: Record<string, string> = {
  owner_direct: "pagado directo al propietario",
  split: "transferencia dividida",
};

export function SettlementForm({
  action,
  ownerId,
  currency,
  items,
  debts,
  accounts,
  today,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  ownerId: string;
  currency: string;
  items: (PendingItem & { paymentLabel: string })[];
  debts: (OwnerDebt & { label: string })[];
  accounts: { id: string; name: string; isDefault: boolean }[];
  today: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const ids = { date: useId(), method: useId(), account: useId() };
  const [selected, setSelected] = useState(() => new Set(items.map((i) => i.allocationId)));
  const [selectedDebts, setSelectedDebts] = useState(() => new Set(debts.map((d) => d.id)));
  const [method, setMethod] = useState("transfer_from_admin");

  const plan = useMemo(
    () =>
      buildSettlementPlan({
        ownerId,
        currency,
        items: items.filter((i) => selected.has(i.allocationId)),
        debts: debts.filter((d) => selectedDebts.has(d.id)),
      }),
    [ownerId, currency, items, debts, selected, selectedDebts],
  );
  const lineFor = (allocationId: string) => plan.lines.find((l) => l.allocationId === allocationId);
  const fmt = (v: string) => formatMoney(v, currency);
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  return (
    <form action={formAction} className="grid gap-6">
      <FormMessage state={state} />
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="allocationId" value={id} />
      ))}
      {[...selectedDebts].map((id) => (
        <input key={id} type="hidden" name="debtId" value={id} />
      ))}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Concepto</TableHead>
              <TableHead className="text-right">Pago</TableHead>
              <TableHead className="text-right">Honorarios</TableHead>
              <TableHead className="text-right">A liquidar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const line = lineFor(item.allocationId);
              const share = item.owners.find((o) => o.clientId === ownerId)?.sharePct;
              return (
                <TableRow key={item.allocationId}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Liquidar ${item.chargeTitle} del ${item.paymentLabel}`}
                      checked={selected.has(item.allocationId)}
                      onChange={() => setSelected((s) => toggle(s, item.allocationId))}
                      className="accent-primary size-4"
                    />
                  </TableCell>
                  <TableCell>
                    {item.chargeTitle} · #{item.contractNumber} {item.propertyLabel}
                    <span className="text-muted-foreground block text-xs">
                      {item.paymentLabel}
                      {share && share !== "100.00" && ` · ${Number(share)}% del propietario`}
                      {RECEIVED_NOTE[item.receivedBy] && ` · ${RECEIVED_NOTE[item.receivedBy]}`}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{line ? fmt(line.gross) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{line ? fmt(line.fee) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{line ? fmt(line.payout) : "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell />
              <TableCell className="font-medium">Subtotal</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(plan.gross)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(plan.fee)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(plan.payoutBeforeDebts)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {debts.length > 0 && (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Descontar deudas del propietario</p>
          {debts.map((d) => {
            const deducted = plan.deductions.find((x) => x.debtId === d.id)?.amount;
            return (
              <label key={d.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedDebts.has(d.id)}
                    onChange={() => setSelectedDebts((s) => toggle(s, d.id))}
                    className="accent-primary size-4"
                  />
                  {d.label}
                </span>
                <span className="tabular-nums">
                  {fmt(d.outstanding)}
                  {deducted && deducted !== d.outstanding && ` (se descuentan ${fmt(deducted)})`}
                </span>
              </label>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor={ids.date}>Fecha</Label>
          <Input id={ids.date} name="date" type="date" defaultValue={today} max={today} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={ids.method}>Forma de pago</Label>
          <Select name="method" value={method} onValueChange={setMethod}>
            <SelectTrigger id={ids.method} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="transfer_from_admin">Transferencia de la administración</SelectItem>
              <SelectItem value="cash">Efectivo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={ids.account}>Sale de</Label>
          <Select name="cashAccountId" defaultValue={accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id}>
            <SelectTrigger id={ids.account} className="w-full">
              <SelectValue placeholder="Caja o cuenta" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-muted/50 grid gap-1 rounded-md p-4 text-sm" aria-live="polite">
        <span>
          A pagar al propietario <strong className="tabular-nums">{fmt(plan.net)}</strong>
        </span>
        {new Decimal(plan.feeOwed).gt(0) && (
          <span>
            Honorarios a cobrarle al propietario (le pagaron directo): <strong className="tabular-nums">{fmt(plan.feeOwed)}</strong>
          </span>
        )}
      </div>

      <TextareaField name="notes" label="Observaciones (opcional)" rows={2} state={state} />

      <div className="flex gap-2">
        <SubmitButton className="w-auto">Registrar liquidación</SubmitButton>
        <Button asChild variant="ghost">
          <Link href="/liquidaciones">Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
