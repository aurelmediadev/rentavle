import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { asUser, getActiveMembership } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const { files } = schema;
const BUCKET = "files";

export type FileEntityType = "contract" | "movement" | "client" | "property";
export const FILE_ENTITY_TYPES: FileEntityType[] = ["contract", "movement", "client", "property"];

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Same list as the bucket's allowed types ("rls_files" migration). */
export const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export class FileError extends Error {}

const ENTITY_TABLE = {
  contract: schema.contracts,
  movement: schema.movements,
  client: schema.clients,
  property: schema.properties,
} as const;

/** "Contrato firmado (1).pdf" → "Contrato-firmado-1.pdf": safe for a Storage key. */
function safeName(filename: string) {
  const cleaned = filename
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (cleaned || "archivo").slice(-80);
}

export async function listFiles(entityType: FileEntityType, entityId: string) {
  const { organizationId } = await getActiveMembership();
  return asUser((tx) =>
    tx
      .select({ id: files.id, filename: files.filename, mimeType: files.mimeType, sizeBytes: files.sizeBytes, createdAt: files.createdAt })
      .from(files)
      .where(and(eq(files.organizationId, organizationId), eq(files.entityType, entityType), eq(files.entityId, entityId)))
      .orderBy(desc(files.createdAt)),
  );
}

/**
 * Step 1 of an upload: checks the file and the entity, and returns a signed URL
 * the browser uploads to directly (no size limit of Server Actions in between).
 */
export async function prepareUpload(input: { entityType: FileEntityType; entityId: string; filename: string; mimeType: string; sizeBytes: number }) {
  if (!FILE_ENTITY_TYPES.includes(input.entityType)) throw new FileError("Tipo inválido");
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_FILE_BYTES) throw new FileError("El archivo supera los 10 MB");
  if (!ALLOWED_FILE_TYPES.includes(input.mimeType)) throw new FileError("Solo PDF, imágenes (JPG, PNG, WEBP, HEIC) o Word");
  const { organizationId } = await getActiveMembership();
  const table = ENTITY_TABLE[input.entityType];
  const [entity] = await asUser((tx) =>
    tx
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.id, input.entityId), eq(table.organizationId, organizationId))),
  );
  if (!entity) throw new FileError("No se encontró dónde adjuntar el archivo");

  const path = `${organizationId}/${input.entityType}/${input.entityId}/${randomUUID()}-${safeName(input.filename)}`;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new FileError(`No se pudo preparar la subida: ${error?.message ?? "error desconocido"}`);
  return { path, token: data.token };
}

/** Step 2: once the bytes are in Storage, records the file. */
export async function confirmUpload(input: { entityType: FileEntityType; entityId: string; path: string; filename: string; mimeType: string; sizeBytes: number }) {
  const { organizationId } = await getActiveMembership();
  if (!input.path.startsWith(`${organizationId}/${input.entityType}/${input.entityId}/`)) throw new FileError("Ruta inválida");
  const supabase = await createSupabaseServerClient();
  const { data: exists } = await supabase.storage.from(BUCKET).exists(input.path);
  if (!exists) throw new FileError("El archivo no llegó a subirse. Probá de nuevo.");
  await asUser((tx, user) =>
    tx.insert(files).values({
      organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      storagePath: input.path,
      filename: input.filename.slice(0, 200),
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      createdBy: user.id,
    }),
  );
}

/** Short-lived link to download a file of the active agency. */
export async function fileDownloadUrl(fileId: string) {
  const { organizationId } = await getActiveMembership();
  const [file] = await asUser((tx) =>
    tx
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.organizationId, organizationId))),
  );
  if (!file) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(file.storagePath, 60, { download: file.filename });
  return data?.signedUrl ?? null;
}

export async function deleteFile(fileId: string) {
  const { organizationId } = await getActiveMembership();
  const [file] = await asUser((tx) =>
    tx
      .delete(files)
      .where(and(eq(files.id, fileId), eq(files.organizationId, organizationId)))
      .returning(),
  );
  if (!file) throw new FileError("Archivo inexistente");
  const supabase = await createSupabaseServerClient();
  await supabase.storage.from(BUCKET).remove([file.storagePath]);
}
