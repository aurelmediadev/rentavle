/**
 * Everything that changes between countries lives behind a CountryPack, so the
 * rest of the code never branches on the country (docs/05-arquitectura.md, "Multipaís").
 * Index fetchers and fiscal providers are added to the pack in later phases.
 */

import type { IndexReading } from '@rentavle/domain';

export type CountryCode = 'AR';

/** An official index series and how to download it. */
export interface IndexSource {
  /** index_series.code */
  readonly code: string;
  /** false when values are loaded by hand (no public API). */
  readonly automatic: boolean;
  /** Values published from `from` to `to` (YYYY-MM-DD), any order. */
  fetch(from: string, to: string): Promise<IndexReading[]>;
}

export interface Option<T extends string = string> {
  readonly value: T;
  readonly label: string;
}

export interface TaxIdRules {
  /** Short name shown in forms: "CUIT", "RUT", "RFC"... */
  readonly label: string;
  readonly placeholder: string;
  /** Returns the canonical (digits only) form, or null if invalid. */
  normalize(input: string): string | null;
  format(canonical: string): string;
}

export interface CountryPack {
  readonly code: CountryCode;
  readonly name: string;
  readonly defaultCurrency: string;
  readonly currencies: readonly string[];
  readonly defaultTimezone: string;
  readonly defaultLocale: string;
  readonly phonePrefix: string;
  readonly taxId: TaxIdRules;
  readonly identityDocuments: readonly Option[];
  readonly taxConditions: readonly Option[];
  /** Index series code preselected for new contracts (index_series.code). */
  readonly defaultIndexSeries: string;
  readonly indexSources: readonly IndexSource[];
  /** First-level subdivisions (provinces, states, regions). */
  readonly regions: readonly Option[];
}
