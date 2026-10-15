import Decimal from "decimal.js";
import {
  type OwnerShare,
  type ReceivedBy,
  type SettleableItem,
  type SettlementLine,
  settlementLines,
  settlementTotals,
} from "@rentavle/domain";

/**
 * What a settlement will pay one owner, computed identically in the browser
 * (preview) and on the server. Pure.
 */

export interface PendingItem {
  allocationId: string;
  contractId: string;
  contractNumber: number;
  propertyLabel: string;
  paymentNumber: number;
  paymentDate: string;
  chargeTitle: string;
  chargeType: SettleableItem["chargeType"];
  appliesFee: boolean;
  paid: string;
  chargeAmount: string;
  receivedBy: ReceivedBy;
  feeType: "pct" | "fixed";
  feeValue: string;
  /** All owners of the contract (needed to split exactly). */
  owners: OwnerShare[];
}

export interface OwnerDebt {
  id: string;
  contractId: string;
  title: string;
  periodMonth: string;
  outstanding: string;
}

export interface SettlementPlan {
  lines: (SettlementLine & { item: PendingItem })[];
  gross: string;
  fee: string;
  payoutBeforeDebts: string;
  feeOwed: string;
  /** Owner debts deducted, in order, limited to the money available. */
  deductions: { debtId: string; amount: string }[];
  net: string;
}

export function buildSettlementPlan(opts: {
  ownerId: string;
  currency: string;
  items: PendingItem[];
  debts: OwnerDebt[];
}): SettlementPlan {
  const lines = opts.items.flatMap((item) =>
    settlementLines(
      [
        {
          allocationId: item.allocationId,
          chargeType: item.chargeType,
          appliesFee: item.appliesFee,
          paid: item.paid,
          chargeAmount: item.chargeAmount,
          receivedBy: item.receivedBy,
          fee: { type: item.feeType, value: item.feeValue },
        },
      ],
      item.owners,
      opts.currency,
    )
      .filter((line) => line.clientId === opts.ownerId)
      .map((line) => ({ ...line, item })),
  );
  const totals = settlementTotals(lines, opts.currency);

  let available = new Decimal(totals.payout);
  const deductions: SettlementPlan["deductions"] = [];
  for (const debt of [...opts.debts].sort((a, b) => a.periodMonth.localeCompare(b.periodMonth))) {
    const amount = Decimal.min(available, debt.outstanding);
    if (amount.lte(0)) continue;
    deductions.push({ debtId: debt.id, amount: amount.toFixed(2) });
    available = available.minus(amount);
  }

  return {
    lines,
    gross: totals.gross,
    fee: totals.fee,
    payoutBeforeDebts: totals.payout,
    feeOwed: totals.feeOwed,
    deductions,
    net: available.toFixed(2),
  };
}
