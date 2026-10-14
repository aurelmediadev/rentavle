export const FREQUENCY_OPTIONS = [
  { value: "1", label: "Mensual" },
  { value: "2", label: "Bimestral" },
  { value: "3", label: "Trimestral" },
  { value: "4", label: "Cuatrimestral" },
  { value: "6", label: "Semestral" },
  { value: "12", label: "Anual" },
] as const;

export function frequencyLabel(months: number | null | undefined): string {
  if (!months) return "";
  return FREQUENCY_OPTIONS.find((o) => o.value === String(months))?.label ?? `cada ${months} meses`;
}

export const COLLECTION_METHOD_OPTIONS = [
  { value: "cash", label: "Efectivo" },
  { value: "transfer_to_admin", label: "Transferencia a la administración" },
  { value: "transfer_to_owner", label: "Transferencia al propietario" },
  { value: "split_transfer", label: "Transferencia dividida (honorarios a la administración, resto al propietario)" },
] as const;

export const LATE_INTEREST_FROM_OPTIONS = [
  { value: "after_due", label: "Desde el día siguiente al vencimiento" },
  { value: "day_1", label: "Desde el día 1 del mes" },
] as const;

export const FEE_TYPE_OPTIONS = [
  { value: "pct", label: "Porcentaje" },
  { value: "fixed", label: "Monto fijo" },
] as const;

export function optionText(options: readonly { value: string; label: string }[], value: string) {
  return options.find((o) => o.value === value)?.label ?? value;
}

export const PERIOD_STATUS_LABEL: Record<string, string> = {
  not_billed: "No registrado",
  initial: "Monto inicial",
  pending: "A actualizar",
  pending_index: "Esperando índice",
  calculated: "Actualizado",
  provisional: "Provisorio",
  manually_adjusted: "Ajustado a mano",
};

export const EVENT_LABEL: Record<string, string> = {
  created: "Contrato creado",
  updated: "Contrato editado",
  extended: "Prórroga",
  early_termination: "Rescisión anticipada",
  termination_cancelled: "Rescisión anulada",
  renewed: "Renovado",
  finished: "Finalizado",
  reopened: "Reabierto",
};
