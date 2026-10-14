import { argentina } from './ar';
import type { CountryCode, CountryPack } from './types';

export type { CountryCode, CountryPack, Option, TaxIdRules } from './types';

const PACKS: Record<CountryCode, CountryPack> = {
  AR: argentina,
};

/** Countries a new organization can choose today. */
export const availableCountries: readonly CountryPack[] = Object.values(PACKS);

export function isCountryCode(value: string): value is CountryCode {
  return value in PACKS;
}

export function getCountryPack(code: string): CountryPack {
  if (!isCountryCode(code)) {
    throw new RangeError(`Unsupported country: ${code}`);
  }
  return PACKS[code];
}
