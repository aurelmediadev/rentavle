import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { schema } from "@rentavle/db";
import { getActiveMembership, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Everything the agency owns, table by table. Available even in read-only mode.
const TABLES = {
  clientes: schema.clients,
  contactos: schema.clientContacts,
  cuentas_bancarias: schema.bankAccounts,
  propiedades: schema.properties,
  propietarios_de_propiedades: schema.propertyOwners,
  contratos: schema.contracts,
  partes_de_contratos: schema.contractParties,
  periodos_de_actualizacion: schema.rentPeriods,
  historial_de_contratos: schema.contractEvents,
  gastos_recurrentes: schema.recurringCharges,
  deudas: schema.charges,
  cajas: schema.cashAccounts,
  movimientos: schema.movements,
  imputaciones: schema.chargeAllocations,
  lineas_de_liquidacion: schema.settlementLines,
  cuentas_contables: schema.ledgerAccounts,
  asientos: schema.ledgerEntries,
  documentos: schema.documents,
  comunicaciones: schema.communications,
  plantillas: schema.messageTemplates,
} satisfies Record<string, PgTable & { organizationId: unknown }>;

/** Full export of the active agency's data as JSON (admins only). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  const { organizationId, role } = await getActiveMembership();
  if (role !== "admin") return new Response("Solo un administrador puede exportar los datos", { status: 403 });

  const data = await db.withUser(user.claims, async (tx) => {
    const [organization] = await tx.select().from(schema.organizations).where(eq(schema.organizations.id, organizationId));
    const out: Record<string, unknown> = { exportado: new Date().toISOString(), inmobiliaria: organization };
    for (const [name, table] of Object.entries(TABLES)) {
      out[name] = await tx.select().from(table).where(eq(table.organizationId, organizationId));
    }
    return out;
  });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="rentavle-${date}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
