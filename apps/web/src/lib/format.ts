/** Display helpers shared by Server and Client Components. */

export interface NamedClient {
  kind: "person" | "company";
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}

export function clientName(client: NamedClient): string {
  if (client.kind === "company") return client.companyName ?? "";
  return [client.firstName, client.lastName].filter(Boolean).join(" ");
}

export interface AddressParts {
  street: string | null;
  streetNumber: string | null;
  unit: string | null;
  city?: string | null;
}

/** "Calle Ficticia 100 2B" (+ ", Ciudad" when asked). */
export function formatAddress(address: AddressParts, withCity = false): string {
  const line = [address.street, address.streetNumber, address.unit].filter(Boolean).join(" ");
  return withCity && address.city ? `${line}, ${address.city}` : line;
}
