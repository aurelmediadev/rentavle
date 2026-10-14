/** Display status of a contract, derived from its stored status and dates. */
export interface ContractStatusInfo {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
}

export function contractStatus(
  contract: { status: string; endDate: string; originalEndDate: string },
  today: string,
): ContractStatusInfo {
  if (contract.status === "renewed") return { label: "Renovado", variant: "outline" };
  if (contract.status === "finished") return { label: "Finalizado", variant: "outline" };
  if (contract.endDate < today) return { label: "Vencido", variant: "destructive" };
  if (contract.endDate < contract.originalEndDate) return { label: "Con rescisión", variant: "secondary" };
  return { label: "Activo", variant: "default" };
}
