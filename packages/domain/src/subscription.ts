import Decimal from 'decimal.js';

/**
 * What an agency can do according to its subscription (docs/01-vision-y-producto.md,
 * "Modelo de negocio"). Pure; the database applies the same rule
 * (private.org_writable, private.contract_limit).
 */

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'read_only' | 'cancelled';

export const TRIAL_DAYS = 21;
export const TRIAL_CONTRACT_LIMIT = 10;

export type Access =
  | { kind: 'trial'; writable: true; daysLeft: number }
  | { kind: 'active'; writable: true }
  /** A payment failed: still writable while MercadoPago retries. */
  | { kind: 'past_due'; writable: true }
  | { kind: 'read_only'; writable: false; reason: 'trial_ended' | 'cancelled' | 'suspended' };

export function accessFor(org: { status: SubscriptionStatus; trialEndsAt: Date | null }, now: Date): Access {
  switch (org.status) {
    case 'active':
      return { kind: 'active', writable: true };
    case 'past_due':
      return { kind: 'past_due', writable: true };
    case 'trialing': {
      const ms = (org.trialEndsAt?.getTime() ?? 0) - now.getTime();
      if (ms <= 0) return { kind: 'read_only', writable: false, reason: 'trial_ended' };
      return { kind: 'trial', writable: true, daysLeft: Math.ceil(ms / 86_400_000) };
    }
    case 'cancelled':
      return { kind: 'read_only', writable: false, reason: 'cancelled' };
    default:
      return { kind: 'read_only', writable: false, reason: 'suspended' };
  }
}

export interface PlanLimits {
  maxActiveContracts: number;
  extraBlockContracts: number | null;
}

/** Active contracts allowed: trial → 10; plan → its limit plus purchased blocks; no plan (pilots) → unlimited. */
export function contractLimit(
  status: SubscriptionStatus,
  plan: PlanLimits | null,
  extraBlocks: number,
): number | null {
  if (status === 'trialing') return TRIAL_CONTRACT_LIMIT;
  if (!plan) return null;
  return plan.maxActiveContracts + (plan.extraBlockContracts ?? 0) * extraBlocks;
}

/**
 * Cheapest plan that fits a number of active contracts (plans sorted by size).
 * Above the biggest plan, the biggest one with extra blocks.
 */
export function suggestedPlan<P extends PlanLimits & { code: string }>(
  plans: readonly P[],
  activeContracts: number,
): { plan: P; extraBlocks: number } | null {
  const sorted = [...plans].sort((a, b) => a.maxActiveContracts - b.maxActiveContracts);
  const fit = sorted.find((p) => p.maxActiveContracts >= activeContracts);
  if (fit) return { plan: fit, extraBlocks: 0 };
  const biggest = sorted.at(-1);
  if (!biggest?.extraBlockContracts) return null;
  return { plan: biggest, extraBlocks: Math.ceil((activeContracts - biggest.maxActiveContracts) / biggest.extraBlockContracts) };
}

/** What the agency pays per period: plan price plus extra blocks (yearly = 10 months). */
export function subscriptionAmount(
  plan: { monthlyPrice: string; annualPrice: string; extraBlockPrice: string | null },
  cycle: 'monthly' | 'annual',
  extraBlocks: number,
): string {
  const base = new Decimal(cycle === 'monthly' ? plan.monthlyPrice : plan.annualPrice);
  const blocks = new Decimal(plan.extraBlockPrice ?? 0).times(extraBlocks).times(cycle === 'monthly' ? 1 : 10);
  return base.plus(blocks).toFixed(2);
}
