import Decimal from 'decimal.js';
import { currencyScale, decimal } from './money';

/**
 * Owner settlements (docs/03-reglas-de-negocio.md §5 and §7). Pure.
 *
 * Each settleable item is a part of a tenant payment that went to a debt in
 * favour of the owner (rent, late interest, one-off charges). For every owner:
 *
 *   gross  = paid × owner's share
 *   fee    = agency fee on the gross (if the debt carries fees)
 *   payout = what the agency must still hand over:
 *            - money received by the agency      → gross − fee
 *            - tenant paid the owner directly    → 0, and the fee becomes a debt
 *                                                   of the owner (feeOwed)
 *            - split transfer (agency kept fee)  → 0
 */

export type ReceivedBy = 'agency' | 'owner_direct' | 'split';

export interface FeeTerms {
  type: 'pct' | 'fixed';
  /** Percent (10 = 10%) or fixed monthly amount. */
  value: string;
}

export interface SettleableItem {
  allocationId: string;
  chargeType: 'rent' | 'late_interest' | 'one_off' | 'adjustment' | 'other';
  /** Whether this debt carries agency fees. */
  appliesFee: boolean;
  /** Part of the tenant payment that went to this debt. */
  paid: string;
  /** Full amount of the debt (for fixed fees prorated over partial payments). */
  chargeAmount: string;
  receivedBy: ReceivedBy;
  fee: FeeTerms;
}

export interface OwnerShare {
  clientId: string;
  /** Percent of the property, e.g. "50". */
  sharePct: string;
}

export interface SettlementLine {
  allocationId: string;
  clientId: string;
  sharePct: string;
  gross: string;
  fee: string;
  payout: string;
  /** Fee the owner owes the agency because the tenant paid the owner directly. */
  feeOwed: string;
}

function feeFor(item: SettleableItem, gross: Decimal, scale: number): Decimal {
  if (!item.appliesFee || gross.isZero()) return new Decimal(0);
  if (item.fee.type === 'pct') {
    return gross.times(item.fee.value).dividedBy(100).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
  }
  // Fixed monthly fee: only on rent, prorated by how much of the rent this payment covers.
  if (item.chargeType !== 'rent') return new Decimal(0);
  const ratio = gross.dividedBy(item.chargeAmount);
  return decimal(item.fee.value).times(ratio).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
}

/** Splits an amount by shares; the last owner absorbs the rounding so parts add up exactly. */
export function splitByShares(amount: string, owners: readonly OwnerShare[], currency: string): string[] {
  const scale = currencyScale(currency);
  const total = decimal(amount);
  const parts: Decimal[] = [];
  let assigned = new Decimal(0);
  owners.forEach((owner, i) => {
    const part =
      i === owners.length - 1
        ? total.minus(assigned)
        : total.times(owner.sharePct).dividedBy(100).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
    parts.push(part);
    assigned = assigned.plus(part);
  });
  return parts.map((p) => p.toFixed(scale));
}

export function settlementLines(
  items: readonly SettleableItem[],
  owners: readonly OwnerShare[],
  currency: string,
): SettlementLine[] {
  if (owners.length === 0) throw new RangeError('A settlement needs at least one owner');
  const totalShare = owners.reduce((sum, o) => sum.plus(o.sharePct), new Decimal(0));
  if (!totalShare.equals(100)) throw new RangeError(`Owner shares must add up to 100 (got ${totalShare})`);
  const scale = currencyScale(currency);

  return items.flatMap((item) => {
    const grossParts = splitByShares(item.paid, owners, currency);
    return owners.map((owner, i) => {
      const gross = decimal(grossParts[i]!);
      const fee = feeFor(item, gross, scale);
      const payout = item.receivedBy === 'agency' ? gross.minus(fee) : new Decimal(0);
      const feeOwed = item.receivedBy === 'owner_direct' ? fee : new Decimal(0);
      return {
        allocationId: item.allocationId,
        clientId: owner.clientId,
        sharePct: owner.sharePct,
        gross: gross.toFixed(scale),
        fee: fee.toFixed(scale),
        payout: payout.toFixed(scale),
        feeOwed: feeOwed.toFixed(scale),
      };
    });
  });
}

export interface SettlementTotals {
  gross: string;
  fee: string;
  payout: string;
  feeOwed: string;
}

export function settlementTotals(lines: readonly SettlementLine[], currency: string): SettlementTotals {
  const scale = currencyScale(currency);
  const sum = (key: keyof SettlementTotals) => lines.reduce((t, l) => t.plus(l[key]), new Decimal(0)).toFixed(scale);
  return { gross: sum('gross'), fee: sum('fee'), payout: sum('payout'), feeOwed: sum('feeOwed') };
}

/**
 * Split transfer: the tenant pays the agency only its fee (and the debts in its
 * favour) and the owners the rest. Returns what went straight to the owners,
 * computed exactly like the settlement lines so the accounts close to zero.
 */
export function ownerDirectAmount(
  items: readonly Omit<SettleableItem, 'receivedBy'>[],
  owners: readonly OwnerShare[],
  currency: string,
): string {
  const lines = settlementLines(
    items.map((i) => ({ ...i, receivedBy: 'split' as const })),
    owners,
    currency,
  );
  return lines
    .reduce((sum, l) => sum.plus(l.gross).minus(l.fee), new Decimal(0))
    .toFixed(currencyScale(currency));
}
