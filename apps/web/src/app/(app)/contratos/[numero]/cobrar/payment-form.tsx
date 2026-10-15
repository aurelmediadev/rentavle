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
import { formatMoney, parseLocaleDecimal } from "@/lib/numbers";
import { type PlanCharge, type PlanContract, buildPaymentPlan } from "../payment-plan";

const METHODS = [
  { value: "cash", label: "Efectivo" },
  { value: "transfer_to_admin", label: "Transferencia a la administración" },
  { value: "transfer_to_owner", label: "Transferencia directa al propietario" },
  { value: "split_transfer", label: "Transferencia dividida" },
] as const;

interface PaymentFormProps {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  contract: PlanContract & { number: number; defaultMethod: string };
  charges: (PlanCharge & { label: string })[];
  accounts: { id: string; name: string }[];
  today: string;
  currentMonth: string;
}

export function PaymentForm({ action, contract, charges, accounts, today, currentMonth }: PaymentFormProps) {
  const [state, formAction] = useActionState(action, initialFormState);
  const ids = { date: useId(), received: useId(), method: useId(), account: useId() };
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(charges.filter((c) => c.periodMonth <= `${currentMonth}-01`).map((c) => c.id)),
  );
  const [date, setDate] = useState(today);
  const [chargeInterest, setChargeInterest] = useState(true);
  const [received, setReceived] = useState("");
  const [method, setMethod] = useState(contract.defaultMethod);

  const receivedValue = received.trim() === "" ? null : parseLocaleDecimal(received);
  const plan = useMemo(
    () =>
      buildPaymentPlan({
        contract,
        charges: charges.filter((c) => selected.has(c.id)),
        paymentDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today,
        chargeInterest,
        received: receivedValue,
      }),
    [contract, charges, selected, date, chargeInterest, receivedValue, today],
  );

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const paidFor = (id: string) => plan.allocation.allocations.find((a) => a.chargeId === id)?.amount ?? null;
  const fmt = (v: string | null) => (v === null ? "—" : formatMoney(v, contract.currency));

  return (
    <form action={formAction} className="grid gap-6">
      <FormMessage state={state} />
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="chargeId" value={id} />
      ))}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Concepto</TableHead>
              <TableHead className="text-right">Adeuda</TableHead>
              <TableHead className="text-right">Se paga</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {charges.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Cobrar ${c.label}`}
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="accent-primary size-4"
                  />
                </TableCell>
                <TableCell>{c.label}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(c.outstanding)}</TableCell>
                <TableCell className="text-right tabular-nums">{selected.has(c.id) ? fmt(paidFor(c.id)) : "—"}</TableCell>
              </TableRow>
            ))}
            {plan.interests.map((i) => (
              <TableRow key={i.key} className="bg-amber-50/60 dark:bg-amber-950/20">
                <TableCell />
                <TableCell>
                  Punitorios
                  <span className="text-muted-foreground block text-xs">{i.explanation}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt(i.amount)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(paidFor(i.key))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell />
              <TableCell className="font-medium">Total a cobrar</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{fmt(plan.totalDue)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="chargeInterest"
          checked={chargeInterest}
          onChange={(e) => setChargeInterest(e.target.checked)}
          className="accent-primary size-4"
        />
        Cobrar punitorios por mora
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor={ids.date}>Fecha del pago</Label>
          <Input id={ids.date} name="date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={ids.received}>Monto recibido</Label>
          <Input
            id={ids.received}
            name="received"
            inputMode="decimal"
            placeholder={plan.totalDue.replace(".", ",").replace(/,00$/, "")}
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            aria-invalid={state.fieldErrors?.received ? true : undefined}
          />
          <p className="text-muted-foreground text-xs">Vacío = el total.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={ids.method}>Forma de pago</Label>
          <Select name="method" value={method} onValueChange={setMethod}>
            <SelectTrigger id={ids.method} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {method !== "transfer_to_owner" ? (
        <div className="grid max-w-sm gap-2">
          <Label htmlFor={ids.account}>Ingresa en</Label>
          <Select name="cashAccountId" defaultValue={accounts[0]?.id}>
            <SelectTrigger id={ids.account} className="w-full">
              <SelectValue placeholder="Elegí la caja o cuenta" />
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
      ) : (
        <p className="text-muted-foreground text-sm">
          El dinero no pasa por la administración: se registra el cobro y el propietario ya recibió su parte.
        </p>
      )}

      <div className="bg-muted/50 grid gap-1 rounded-md p-4 text-sm" aria-live="polite">
        <span>
          Recibe <strong className="tabular-nums">{fmt(plan.received)}</strong>
        </span>
        {new Decimal(plan.allocation.unpaid).gt(0) && (
          <span>
            Queda debiendo <strong className="tabular-nums">{fmt(plan.allocation.unpaid)}</strong> (pago parcial)
          </span>
        )}
        {new Decimal(plan.allocation.surplus).gt(0) && (
          <span>
            Queda <strong className="tabular-nums">{fmt(plan.allocation.surplus)}</strong> como saldo a favor del inquilino
          </span>
        )}
      </div>

      <TextareaField name="notes" label="Observaciones (opcional)" rows={2} state={state} />

      <div className="flex gap-2">
        <SubmitButton className="w-auto">Registrar cobro</SubmitButton>
        <Button asChild variant="ghost">
          <Link href={`/contratos/${contract.number}`}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
