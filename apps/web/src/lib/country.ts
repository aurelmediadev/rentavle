import { getCountryPack, type CountryPack, type Option } from "@rentavle/country";

/** Plain, serializable subset of a CountryPack for Client Components. */
export interface CountryFormOptions {
  code: string;
  phonePrefix: string;
  taxIdLabel: string;
  taxIdPlaceholder: string;
  identityDocuments: Option[];
  taxConditions: Option[];
  regions: Option[];
  currencies: string[];
}

export function countryFormOptions(code: string): CountryFormOptions {
  const pack: CountryPack = getCountryPack(code);
  return {
    code: pack.code,
    phonePrefix: pack.phonePrefix,
    taxIdLabel: pack.taxId.label,
    taxIdPlaceholder: pack.taxId.placeholder,
    identityDocuments: [...pack.identityDocuments],
    taxConditions: [...pack.taxConditions],
    regions: [...pack.regions],
    currencies: [...pack.currencies],
  };
}

export function optionLabel(options: readonly Option[], value: string | null | undefined): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? value;
}
