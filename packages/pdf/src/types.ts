/**
 * Data printed on each document, frozen when the document is issued
 * (documents.data). Amounts are decimal strings, dates YYYY-MM-DD; the templates
 * format them. Bump `version` when the shape changes and keep old versions renderable.
 */

export interface AgencyInfo {
  name: string;
  legalName: string | null;
  taxIdLabel: string;
  taxId: string | null;
  taxCondition: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  /** Public URLs of the branding images when the document was issued. */
  logoUrl: string | null;
  signatureUrl: string | null;
  locale: string;
}

export interface ReceiptData {
  kind: 'receipt';
  version: 1;
  agency: AgencyInfo;
  date: string;
  currency: string;
  amount: string;
  amountInWords: string;
  payer: { name: string; taxId: string | null };
  contractNumber: number | null;
  property: string | null;
  lines: { concept: string; amount: string }[];
  /** Overpayment kept as saldo a favor. */
  credit: string | null;
  method: string;
  notes: string | null;
}

export interface SettlementData {
  kind: 'settlement';
  version: 1;
  agency: AgencyInfo;
  date: string;
  currency: string;
  owner: { name: string; taxId: string | null };
  lines: { concept: string; detail: string; gross: string; fee: string; payout: string }[];
  deductions: { concept: string; amount: string }[];
  total: string;
  amountInWords: string;
  method: string;
  account: string | null;
  /** Debts left to the owner (fees of payments made to them directly). */
  ownerDebts: { concept: string; amount: string }[];
  notes: string | null;
}

export type DocumentData = ReceiptData | SettlementData;

export interface DocumentMeta {
  number: number;
  status: 'issued' | 'void';
}

/** Images already downloaded by the caller (data URIs), so rendering never hits the network. */
export interface DocumentImages {
  logo?: string | null;
  signature?: string | null;
}
