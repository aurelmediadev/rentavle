import { getCurrentUser } from "@/lib/auth";
import { fileDownloadUrl } from "@/lib/files";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Downloads an attachment of the active agency through a one-minute signed link. */
export async function GET(_: Request, { params }: RouteContext<"/api/archivos/[id]">) {
  if (!(await getCurrentUser())) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return new Response("No encontrado", { status: 404 });
  const url = await fileDownloadUrl(id);
  if (!url) return new Response("No encontrado", { status: 404 });
  return Response.redirect(url, 302);
}
