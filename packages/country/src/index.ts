import { argentina } from './ar';
import type { CountryCode, CountryPack } from './types';

export type { CountryCode, CountryPack, IndexSource, Option, TaxIdRules } from './types';

const PACKS: Record<CountryCode, CountryPack> = {
  AR: argentina,
};

/** Countries a new organization can choose today. */
export const availableCountries: readonly CountryPack[] = Object.values(PACKS);

export function isCountryCode(value: string): value is CountryCode {
  return value in PACKS;
}

/** Index source for a series code, from whichever country defines it. */
export function getIndexSource(code: string) {
  for (const pack of Object.values(PACKS)) {
    const source = pack.indexSources.find((s) => s.code === code);
    if (source) return source;
  }
  return null;
}

export function getCountryPack(code: string): CountryPack {
  if (!isCountryCode(code)) {
    throw new RangeError(`Unsupported country: ${code}`);
  }
  return PACKS[code];
}
