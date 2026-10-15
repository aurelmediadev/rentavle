import Decimal from "decimal.js";
import { type AllocationResult, type OpenCharge, allocatePayment, lateInterest } from "@rentavle/domain";

/**
 * What a payment will do, computed the same way in the browser (preview) and on
 * the server (when recording it): late interest per overdue rent, total due and
 * how the received money is imputed. Pure.
 */

export interface PlanCharge {
  id: string;
  type: string;
  title: string;
  periodMonth: string;
  dueDate: string;
  /** Still owed (amount − active allocations). */
  outstanding: string;
  /** Date of the last payment towards this debt, if any. */
  lastPaymentDate: string | null;
}

export interface PlanContract {
  currency: string;
  lateInterestDailyPct: string;
  lateInterestFrom: "after_due" | "day_1";
}

export interface PlannedInterest {
  /** Pseudo id used in the allocation until the charge exists. */
  key: string;
  rentChargeId: string;
  periodMonth: string;
  amount: string;
  explanation: string;
}

export interface PaymentPlan {
  interests: PlannedInterest[];
  totalDue: string;
  received: string;
  allocation: AllocationResult;
}

export function buildPaymentPlan(opts: {
  contract: PlanContract;
  charges: PlanCharge[];
  paymentDate: string;
  chargeInterest: boolean;
  /** Money received; defaults to the total due. */
  received?: string | null;
}): PaymentPlan {
  const { contract, charges, paymentDate } = opts;
  const interests: PlannedInterest[] = [];
  if (opts.chargeInterest) {
    for (const charge of charges.filter((c) => c.type === "rent")) {
      const interest = lateInterest({
        outstanding: charge.outstanding,
        currency: contract.currency,
        dueDate: charge.dueDate,
        paymentDate,
        dailyPct: contract.lateInterestDailyPct,
        from: contract.lateInterestFrom,
        lastPaymentDate: charge.lastPaymentDate,
      });
      if (interest) {
        interests.push({
          key: `interest:${charge.id}`,
          rentChargeId: charge.id,
          periodMonth: charge.periodMonth,
          amount: interest.amount,
          explanation: interest.explanation,
        });
      }
    }
  }

  const open: OpenCharge[] = [
    ...charges.map((c) => ({
      id: c.id,
      kind: c.type === "rent" ? ("rent" as const) : c.type === "late_interest" ? ("late_interest" as const) : ("other" as const),
      periodMonth: c.periodMonth,
      outstanding: c.outstanding,
    })),
    ...interests.map((i) => ({ id: i.key, kind: "late_interest" as const, periodMonth: i.periodMonth, outstanding: i.amount })),
  ];
  const totalDue = Decimal.max(
    open.reduce((sum, c) => sum.plus(c.outstanding), new Decimal(0)),
    0,
  ).toFixed(2);
  const received = opts.received && opts.received !== "" ? opts.received : totalDue;
  return { interests, totalDue, received, allocation: allocatePayment(received, open, contract.currency) };
}
