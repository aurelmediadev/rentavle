"use client";

import Link from "next/link";
import { useActionState, useId, useMemo, useState } from "react";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import {
  type PlannedPeriod,
  durationLabel,
  formatYearMonth,
  parseYearMonth,
  planPeriods,
  startMonthOf,
} from "@rentavle/domain";
import { ClientPicker, type ClientOption } from "@/components/client-picker";
import { Field, FormMessage, FormSection, SelectField, SubmitButton, TextareaField } from "@/components/form";
import { OptionPicker, type PickerOption } from "@/components/option-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type FormState, initialFormState } from "@/lib/forms";
import {
  COLLECTION_METHOD_OPTIONS,
  FEE_TYPE_OPTIONS,
  FREQUENCY_OPTIONS,
  LATE_INTEREST_FROM_OPTIONS,
  PERIOD_STATUS_LABEL,
} from "./labels";

const NO_UPDATE = "none";
const FIXED_PCT = "fixed_pct";

interface ContractFormProps {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  properties: PickerOption[];
  clients: ClientOption[];
  indexSeries: { code: string; name: string }[];
  currencies: string[];
  defaultIndexSeries: string;
  /** "YYYY-MM" in the organization's time zone. */
  currentMonth: string;
  defaults?: Record<string, string>;
  initialPropertyId?: string | null;
  initialTenantIds?: string[];
  initialGuarantorIds?: string[];
  renewedFrom?: { id: string; number: number } | null;
}

function addYears(isoDate: string, years: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function safePlan(start: string, end: string, frequency: number | null, firstBilled: string): PlannedPeriod[] | null {
  try {
    return planPeriods({ startDate: start, endDate: end }, frequency, parseYearMonth(firstBilled));
  } catch {
    return null;
  }
}

const monthLabel = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
function formatMonthLong(ym: string) {
  return monthLabel.format(new Date(`${ym}-01T00:00:00Z`));
}

export function ContractForm({
  action,
  properties,
  clients,
  indexSeries,
  currencies,
  defaultIndexSeries,
  currentMonth,
  defaults = {},
  initialPropertyId = null,
  initialTenantIds = [],
  initialGuarantorIds = [],
  renewedFrom = null,
}: ContractFormProps) {
  const [state, formAction] = useActionState(action, { ...initialFormState, values: defaults });
  const v = state.values ?? {};
  const ids = { currency: useId(), update: useId(), frequency: useId(), firstBilled: useId() };

  const [propertyId, setPropertyId] = useState<string | null>(v.propertyId || initialPropertyId);
  const [tenantIds, setTenantIds] = useState<(string | null)[]>(initialTenantIds.length ? initialTenantIds : [null]);
  const [guarantorIds, setGuarantorIds] = useState<(string | null)[]>(initialGuarantorIds);
  const [startDate, setStartDate] = useState(v.startDate ?? "");
  const [endDate, setEndDate] = useState(v.endDate ?? "");
  const [update, setUpdate] = useState(
    v.update ?? (indexSeries.some((s) => s.code === defaultIndexSeries) ? defaultIndexSeries : NO_UPDATE),
  );
  const [frequency, setFrequency] = useState(v.updateFrequencyMonths || "6");
  const [feeType, setFeeType] = useState(v.feeType ?? "pct");

  const validTerm = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate > startDate;
  const startMonth = validTerm ? formatYearMonth(startMonthOf({ startDate, endDate })) : null;
  const inProgress = startMonth !== null && startMonth < currentMonth;
  const [firstBilledMonth, setFirstBilledMonth] = useState(v.firstBilledMonth ?? currentMonth);
  const effectiveFirstBilled = !validTerm ? null : inProgress ? firstBilledMonth : startMonth!;

  const plan = useMemo(
    () =>
      validTerm && effectiveFirstBilled
        ? safePlan(startDate, endDate, update === NO_UPDATE ? null : Number(frequency), effectiveFirstBilled)
        : null,
    [validTerm, startDate, endDate, update, frequency, effectiveFirstBilled],
  );

  const pickedPeople = [...tenantIds, ...guarantorIds].filter((id): id is string => Boolean(id));

  return (
    <form action={formAction} className="grid gap-6">
      <FormMessage state={state} />
      {renewedFrom && (
        <p className="bg-muted rounded-md px-3 py-2 text-sm">
          Renovación del contrato #{renewedFrom.number}. Al guardar, el contrato anterior queda como renovado.
        </p>
      )}
      <input type="hidden" name="renewedFromContractId" value={renewedFrom?.id ?? ""} />

      <FormSection title="Propiedad y partes" description="Los propietarios y sus porcentajes se toman de la propiedad.">
        <div className="grid gap-2">
          <Label>Propiedad</Label>
          <input type="hidden" name="propertyId" value={propertyId ?? ""} />
          <OptionPicker
            options={properties}
            value={propertyId}
            onChange={setPropertyId}
            placeholder="Elegí la propiedad"
            ariaLabel="Propiedad"
            searchPlaceholder="Buscar por dirección o propietario…"
            emptyText="No encontramos propiedades."
            createHref="/propiedades/nueva"
            createLabel="Crear propiedad nueva"
          />
          {state.fieldErrors?.propertyId && <p className="text-destructive text-xs">{state.fieldErrors.propertyId[0]}</p>}
        </div>

        <PeopleList
          label="Inquilino"
          name="tenantId"
          clients={clients}
          ids={tenantIds}
          setIds={setTenantIds}
          exclude={pickedPeople}
          minRows={1}
          error={state.fieldErrors?.tenantIds?.[0]}
        />
        <PeopleList
          label="Garante"
          name="guarantorId"
          clients={clients}
          ids={guarantorIds}
          setIds={setGuarantorIds}
          exclude={pickedPeople}
          minRows={0}
        />
      </FormSection>

      <FormSection title="Plazo y monto">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="startDate"
            label="Inicio"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            state={state}
          />
          <Field
            name="endDate"
            label="Fin"
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            state={state}
            hint={validTerm ? `Duración: ${durationLabel({ startDate, endDate })}` : undefined}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((years) => (
            <Button
              key={years}
              type="button"
              variant="outline"
              size="sm"
              disabled={!startDate}
              onClick={() => setEndDate(addYears(startDate, years))}
            >
              {years === 1 ? "1 año" : `${years} años`}
            </Button>
          ))}
        </div>

        {inProgress && (
          <div className="bg-muted/60 grid gap-3 rounded-md p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CalendarClock className="size-4" /> Contrato en curso
            </p>
            <p className="text-muted-foreground text-sm">
              Las cuotas anteriores al primer mes a registrar se consideran pagas y no generan deudas.
            </p>
            <div className="grid max-w-xs gap-2">
              <Label htmlFor={ids.firstBilled}>Primer mes a registrar</Label>
              <Input
                id={ids.firstBilled}
                name="firstBilledMonth"
                type="month"
                min={startMonth ?? undefined}
                max={endDate.slice(0, 7)}
                value={firstBilledMonth}
                onChange={(e) => setFirstBilledMonth(e.target.value)}
              />
              {state.fieldErrors?.firstBilledMonth && (
                <p className="text-destructive text-xs">{state.fieldErrors.firstBilledMonth[0]}</p>
              )}
            </div>
          </div>
        )}
        {!inProgress && <input type="hidden" name="firstBilledMonth" value={effectiveFirstBilled ?? ""} />}

        <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
          <div className="grid gap-2">
            <Label htmlFor={ids.currency}>Moneda</Label>
            <Select name="currency" defaultValue={v.currency ?? currencies[0]}>
              <SelectTrigger id={ids.currency} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field
            name="amount"
            label={
              inProgress && effectiveFirstBilled
                ? `Monto vigente en ${formatMonthLong(effectiveFirstBilled)}`
                : "Monto inicial del alquiler"
            }
            inputMode="decimal"
            placeholder="500.000"
            required
            state={state}
          />
        </div>
      </FormSection>

      <FormSection title="Actualización">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor={ids.update}>Índice</Label>
            <Select name="update" value={update} onValueChange={setUpdate}>
              <SelectTrigger id={ids.update} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_UPDATE}>Sin actualización</SelectItem>
                {indexSeries.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.name}
                  </SelectItem>
                ))}
                <SelectItem value={FIXED_PCT}>Porcentaje fijo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {update !== NO_UPDATE && (
            <div className="grid gap-2">
              <Label htmlFor={ids.frequency}>Frecuencia</Label>
              <Select name="updateFrequencyMonths" value={frequency} onValueChange={setFrequency}>
                <SelectTrigger id={ids.frequency} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {update === FIXED_PCT && (
            <Field name="fixedUpdatePct" label="Aumento por período (%)" inputMode="decimal" placeholder="10" state={state} />
          )}
        </div>

        {plan && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead>Desde</TableHead>
                  <TableHead>Hasta</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.map((p) => (
                  <TableRow key={p.number}>
                    <TableCell>{p.number}</TableCell>
                    <TableCell>{formatMonthLong(formatYearMonth(p.startMonth))}</TableCell>
                    <TableCell>{formatMonthLong(formatYearMonth(p.endMonth))}</TableCell>
                    <TableCell className={p.status === "initial" ? "font-medium" : "text-muted-foreground"}>
                      {PERIOD_STATUS_LABEL[p.status]}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </FormSection>

      <FormSection title="Honorarios y punitorios">
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <SelectField
            name="feeType"
            label="Honorarios"
            state={state}
            options={FEE_TYPE_OPTIONS}
            defaultValue="pct"
            onValueChange={setFeeType}
          />
          <Field
            name="feeValue"
            label={feeType === "pct" ? "Porcentaje sobre lo cobrado" : "Monto fijo mensual"}
            inputMode="decimal"
            placeholder={feeType === "pct" ? "10" : "50.000"}
            required
            state={state}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            name="lateInterestDailyPct"
            label="Punitorio diario (%)"
            inputMode="decimal"
            defaultValue={v.lateInterestDailyPct ?? "0,5"}
            state={{ ...state, values: undefined }}
            hint="0 para no cobrar punitorios."
          />
          <Field
            name="dueDay"
            label="Día de vencimiento"
            type="number"
            min={1}
            max={28}
            defaultValue={v.dueDay ?? "10"}
            state={{ ...state, values: undefined }}
          />
          <SelectField
            name="lateInterestFrom"
            label="Los punitorios corren"
            state={state}
            options={LATE_INTEREST_FROM_OPTIONS}
            defaultValue="after_due"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="feesOnLateInterest"
            defaultChecked={v.feesOnLateInterest === "on"}
            className="accent-primary size-4"
          />
          Cobrar honorarios también sobre los punitorios
        </label>
      </FormSection>

      <FormSection title="Cobro">
        <SelectField
          name="collectionMethod"
          label="Forma de cobro habitual"
          state={state}
          options={COLLECTION_METHOD_OPTIONS}
          defaultValue="cash"
        />
        <TextareaField name="notes" label="Notas internas" rows={3} state={state} />
      </FormSection>

      <div className="flex gap-2">
        <SubmitButton className="w-auto">{renewedFrom ? "Crear renovación" : "Crear contrato"}</SubmitButton>
        <Button asChild variant="ghost">
          <Link href={renewedFrom ? `/contratos/${renewedFrom.number}` : "/contratos"}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}

function PeopleList({
  label,
  name,
  clients,
  ids,
  setIds,
  exclude,
  minRows,
  error,
}: {
  label: string;
  name: string;
  clients: ClientOption[];
  ids: (string | null)[];
  setIds: (update: (ids: (string | null)[]) => (string | null)[]) => void;
  exclude: string[];
  minRows: number;
  error?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label === "Inquilino" ? "Inquilinos" : "Garantes"}</Label>
      {ids.map((id, index) => (
        <div key={index} className="grid grid-cols-[1fr_auto] gap-2">
          <input type="hidden" name={name} value={id ?? ""} />
          <ClientPicker
            clients={clients}
            value={id}
            onChange={(clientId) => setIds((list) => list.map((x, i) => (i === index ? clientId : x)))}
            exclude={exclude}
            placeholder={`Elegí el ${label.toLowerCase()}`}
            ariaLabel={`${label} ${index + 1}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Quitar ${label.toLowerCase()}`}
            disabled={ids.length <= minRows}
            onClick={() => setIds((list) => list.filter((_, i) => i !== index))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      {error && <p className="text-destructive text-xs">{error}</p>}
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setIds((list) => [...list, null])}>
        <Plus /> {label}
      </Button>
    </div>
  );
}
