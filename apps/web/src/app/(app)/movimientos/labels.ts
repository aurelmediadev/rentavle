export const MOVEMENT_TYPE: Record<string, string> = {
  tenant_payment: "Cobro",
  owner_settlement: "Liquidación",
  manual_income: "Ingreso",
  manual_expense: "Egreso",
  transfer: "Transferencia",
};

export const PAYMENT_METHOD: Record<string, string> = {
  cash: "Efectivo",
  transfer_to_admin: "Transferencia a la administración",
  transfer_to_owner: "Transferencia al propietario",
  split_transfer: "Transferencia dividida",
  online: "Pago online",
  transfer_from_admin: "Transferencia de la administración",
};
