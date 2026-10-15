import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentFileName, hashToken, renderIssuedDocument } from "@/lib/documents";

/**
 * Public link to a document (sent to tenants and owners). No session: the token
 * is the only credential, so the lookup runs as anon through shared_document().
 */
export async function GET(_: Request, { params }: RouteContext<"/d/[token]">) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return notFound();
  const rows = await db.asAnon((tx) =>
    tx.execute<{ type: "receipt" | "settlement"; number: number; status: "issued" | "void"; data: unknown }>(
      sql`select type, number, status, data from public.shared_document(${hashToken(token)})`,
    ),
  );
  const doc = rows[0];
  if (!doc) return notFound();

  const pdf = await renderIssuedDocument(doc);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${documentFileName(doc)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

function notFound() {
  return new Response("El link no existe o venció. Pedile uno nuevo a la inmobiliaria.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
