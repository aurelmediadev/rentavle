"use client";

import { OptionPicker, type PickerOption } from "./option-picker";

export type ClientOption = PickerOption;

export function ClientPicker({
  clients,
  ...props
}: Omit<React.ComponentProps<typeof OptionPicker>, "options"> & { clients: ClientOption[] }) {
  return (
    <OptionPicker
      options={clients}
      searchPlaceholder="Buscar por nombre o documento…"
      emptyText="No encontramos clientes."
      createHref="/clientes/nuevo"
      createLabel="Crear cliente nuevo"
      {...props}
    />
  );
}
