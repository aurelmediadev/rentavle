import { and, eq } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { getActiveMembership, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { documentFileName, renderIssuedDocument } from "@/lib/documents";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PDF of an issued document of the active organization. `?formato=media`: half-sheet receipt. */
export async function GET(request: Request, { params }: RouteContext<"/api/documentos/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return new Response("No encontrado", { status: 404 });
  const { organizationId } = await getActiveMembership();

  const [doc] = await db.withUser(user.claims, (tx) =>
    tx
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.id, id), eq(schema.documents.organizationId, organizationId))),
  );
  if (!doc) return new Response("No encontrado", { status: 404 });

  const format = new URL(request.url).searchParams.get("formato") === "media" ? "half" : "a4";
  const pdf = await renderIssuedDocument(doc, format);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${documentFileName(doc)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
