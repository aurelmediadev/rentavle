import { describe, expect, it } from 'vitest';
import { accessFor, contractLimit, subscriptionAmount, suggestedPlan } from './subscription';

const now = new Date('2026-10-15T12:00:00Z');

describe('access', () => {
  it('counts the days left of the trial and locks it when it ends', () => {
    expect(accessFor({ status: 'trialing', trialEndsAt: new Date('2026-11-05T12:00:00Z') }, now)).toEqual({ kind: 'trial', writable: true, daysLeft: 21 });
    expect(accessFor({ status: 'trialing', trialEndsAt: new Date('2026-10-15T13:00:00Z') }, now)).toMatchObject({ daysLeft: 1 });
    expect(accessFor({ status: 'trialing', trialEndsAt: new Date('2026-10-15T11:00:00Z') }, now)).toEqual({
      kind: 'read_only',
      writable: false,
      reason: 'trial_ended',
    });
  });

  it('keeps writing while a failed payment is retried, and locks cancelled or suspended accounts', () => {
    expect(accessFor({ status: 'active', trialEndsAt: null }, now).writable).toBe(true);
    expect(accessFor({ status: 'past_due', trialEndsAt: null }, now).writable).toBe(true);
    expect(accessFor({ status: 'cancelled', trialEndsAt: null }, now)).toMatchObject({ writable: false, reason: 'cancelled' });
    expect(accessFor({ status: 'read_only', trialEndsAt: null }, now)).toMatchObject({ writable: false, reason: 'suspended' });
  });
});

describe('contract limits', () => {
  const plans = [
    { code: 'corporativo', maxActiveContracts: 300, extraBlockContracts: 100 },
    { code: 'inicial', maxActiveContracts: 40, extraBlockContracts: null },
    { code: 'profesional', maxActiveContracts: 120, extraBlockContracts: null },
  ];

  it('limits the trial to 10 and plans to their size plus extra blocks', () => {
    expect(contractLimit('trialing', plans[1]!, 0)).toBe(10);
    expect(contractLimit('active', plans[1]!, 0)).toBe(40);
    expect(contractLimit('active', plans[0]!, 2)).toBe(500);
    expect(contractLimit('active', null, 0)).toBeNull();
  });

  it('suggests the cheapest plan that fits', () => {
    expect(suggestedPlan(plans, 0)?.plan.code).toBe('inicial');
    expect(suggestedPlan(plans, 40)?.plan.code).toBe('inicial');
    expect(suggestedPlan(plans, 41)?.plan.code).toBe('profesional');
    expect(suggestedPlan(plans, 301)).toMatchObject({ plan: { code: 'corporativo' }, extraBlocks: 1 });
    expect(suggestedPlan(plans, 450)).toMatchObject({ extraBlocks: 2 });
  });
});

describe('subscription amount', () => {
  const corporativo = { monthlyPrice: '89000.00', annualPrice: '890000.00', extraBlockPrice: '15000.00' };
  it('adds extra blocks, with two free months when paying yearly', () => {
    expect(subscriptionAmount(corporativo, 'monthly', 0)).toBe('89000.00');
    expect(subscriptionAmount(corporativo, 'monthly', 2)).toBe('119000.00');
    expect(subscriptionAmount(corporativo, 'annual', 1)).toBe('1040000.00');
  });
});
