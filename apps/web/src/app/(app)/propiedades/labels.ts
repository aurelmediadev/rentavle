export const PROPERTY_TYPE_OPTIONS = [
  { value: "apartment", label: "Departamento" },
  { value: "house", label: "Casa" },
  { value: "commercial", label: "Local comercial" },
  { value: "office", label: "Oficina" },
  { value: "parking", label: "Cochera" },
  { value: "land", label: "Terreno" },
  { value: "other", label: "Otro" },
] as const;

export const PROPERTY_STATUS_OPTIONS = [
  { value: "available", label: "Disponible" },
  { value: "rented", label: "Alquilada" },
  { value: "unavailable", label: "No disponible" },
] as const;

export function propertyTypeLabel(value: string) {
  return PROPERTY_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function propertyStatusLabel(value: string) {
  return PROPERTY_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
