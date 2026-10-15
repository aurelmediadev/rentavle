import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { documentNumber, renderDocument } from './index';
import type { AgencyInfo, ReceiptData, SettlementData } from './types';

const agency: AgencyInfo = {
  name: 'Inmobiliaria Demo',
  legalName: 'Demo Propiedades S.R.L.',
  taxIdLabel: 'CUIT',
  taxId: '30-71234567-8',
  taxCondition: 'Responsable inscripto',
  address: 'Av. Corrientes 1234, CABA',
  phone: '+54 11 5555-1234',
  email: 'administracion@demo.com.ar',
  logoUrl: null,
  signatureUrl: null,
  locale: 'es-AR',
};

export const receipt: ReceiptData = {
  kind: 'receipt',
  version: 1,
  agency,
  date: '2026-10-14',
  currency: 'ARS',
  amount: '615000.00',
  amountInWords: 'pesos seiscientos quince mil con 00/100',
  payer: { name: 'Ana Inquilina', taxId: 'DNI 30.123.456' },
  contractNumber: 3,
  property: 'Juan B. Justo 1234, 5° B',
  lines: [
    { concept: 'Alquiler octubre 2026', amount: '500000.00' },
    { concept: 'Expensas octubre 2026', amount: '80000.00' },
    { concept: 'Punitorios octubre 2026 (14 días × 0,5%)', amount: '35000.00' },
  ],
  credit: null,
  method: 'Efectivo',
  notes: null,
};

export const settlement: SettlementData = {
  kind: 'settlement',
  version: 1,
  agency,
  date: '2026-10-15',
  currency: 'ARS',
  owner: { name: 'Pedro Dueño', taxId: 'CUIT 20-12345678-9' },
  lines: [
    { concept: 'Alquiler octubre 2026', detail: 'Contrato #3 · cobro #12', gross: '500000.00', fee: '50000.00', payout: '450000.00' },
    { concept: 'Punitorios octubre 2026', detail: 'Contrato #3 · cobro #12', gross: '35000.00', fee: '3500.00', payout: '31500.00' },
  ],
  deductions: [{ concept: 'Reparación de techo', amount: '20000.00' }],
  total: '461500.00',
  amountInWords: 'pesos cuatrocientos sesenta y un mil quinientos con 00/100',
  method: 'Transferencia de la administración',
  account: 'Banco Nación',
  ownerDebts: [],
  notes: null,
};

const isPdf = (b: Buffer) => b.subarray(0, 5).toString() === '%PDF-';

describe('documents', () => {
  it('pads the number', () => {
    expect(documentNumber(12)).toBe('00000012');
  });

  it('renders receipts on A4 (original and duplicate) and half-sheet, and void ones', async () => {
    const a4 = await renderDocument(receipt, { number: 12, status: 'issued' });
    const half = await renderDocument(receipt, { number: 12, status: 'issued' }, { format: 'half' });
    const voided = await renderDocument(receipt, { number: 12, status: 'void' });
    for (const pdf of [a4, half, voided]) expect(isPdf(pdf)).toBe(true);
    expect(voided.length).toBeGreaterThan(a4.length);
    if (process.env.PDF_OUT) {
      await writeFile(join(process.env.PDF_OUT, 'receipt.pdf'), a4);
      await writeFile(join(process.env.PDF_OUT, 'receipt-half.pdf'), half);
      await writeFile(join(process.env.PDF_OUT, 'receipt-void.pdf'), voided);
    }
  });

  it('renders settlements', async () => {
    const pdf = await renderDocument(settlement, { number: 4, status: 'issued' });
    expect(isPdf(pdf)).toBe(true);
    if (process.env.PDF_OUT) await writeFile(join(process.env.PDF_OUT, 'settlement.pdf'), pdf);
  });
});
