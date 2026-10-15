import { describe, expect, it } from 'vitest';
import { type SettleableItem, settlementLines, settlementTotals, splitByShares } from './settlement';

const pct10 = { type: 'pct' as const, value: '10' };
const item = (over: Partial<SettleableItem>): SettleableItem => ({
  allocationId: 'a1',
  chargeType: 'rent',
  appliesFee: true,
  paid: '500000',
  chargeAmount: '500000',
  receivedBy: 'agency',
  fee: pct10,
  ...over,
});
const single = [{ clientId: 'pedro', sharePct: '100' }];

describe('settlement lines', () => {
  it('reproduces Krenta: 500.000 + 35.000 interest with fees on interest → 481.500', () => {
    const lines = settlementLines(
      [item({}), item({ allocationId: 'a2', chargeType: 'late_interest', paid: '35000', chargeAmount: '35000' })],
      single,
      'ARS',
    );
    expect(settlementTotals(lines, 'ARS')).toEqual({ gross: '535000.00', fee: '53500.00', payout: '481500.00', feeOwed: '0.00' });
  });

  it('skips fees on debts that do not carry them (Rentavle default for interest)', () => {
    const lines = settlementLines(
      [item({}), item({ allocationId: 'a2', chargeType: 'late_interest', appliesFee: false, paid: '35000', chargeAmount: '35000' })],
      single,
      'ARS',
    );
    expect(settlementTotals(lines, 'ARS')).toMatchObject({ fee: '50000.00', payout: '485000.00' });
  });

  it('splits between co-owners exactly, the last one absorbing rounding', () => {
    const owners = [
      { clientId: 'laura', sharePct: '33.33' },
      { clientId: 'jorge', sharePct: '33.33' },
      { clientId: 'ines', sharePct: '33.34' },
    ];
    const lines = settlementLines([item({ paid: '100000.01', chargeAmount: '100000.01' })], owners, 'ARS');
    expect(lines.map((l) => l.gross)).toEqual(['33330.00', '33330.00', '33340.01']);
    expect(settlementTotals(lines, 'ARS').gross).toBe('100000.01');
  });

  it('prorates a fixed monthly fee over a partial rent payment', () => {
    const fixed = { type: 'fixed' as const, value: '40000' };
    const lines = settlementLines([item({ paid: '250000', fee: fixed })], single, 'ARS');
    expect(lines[0]).toMatchObject({ fee: '20000.00', payout: '230000.00' });
    // Fixed fees only apply to rent.
    const other = settlementLines([item({ chargeType: 'one_off', paid: '10000', chargeAmount: '10000', fee: fixed })], single, 'ARS');
    expect(other[0]?.fee).toBe('0.00');
  });

  it('turns the fee into an owner debt when the tenant paid the owner directly', () => {
    const lines = settlementLines([item({ receivedBy: 'owner_direct' })], single, 'ARS');
    expect(lines[0]).toMatchObject({ gross: '500000.00', fee: '50000.00', payout: '0.00', feeOwed: '50000.00' });
  });

  it('pays nothing on split transfers (the agency already kept its fee)', () => {
    const lines = settlementLines([item({ receivedBy: 'split' })], single, 'ARS');
    expect(lines[0]).toMatchObject({ payout: '0.00', feeOwed: '0.00', fee: '50000.00' });
  });

  it('validates shares', () => {
    expect(() => settlementLines([item({})], [{ clientId: 'x', sharePct: '90' }], 'ARS')).toThrow(RangeError);
    expect(splitByShares('1', [{ clientId: 'a', sharePct: '50' }, { clientId: 'b', sharePct: '50' }], 'CLP')).toEqual(['1', '0']);
  });
});
