"use server";

import { revalidatePath } from "next/cache";
import { FileError, type FileEntityType, confirmUpload, deleteFile, prepareUpload } from "@/lib/files";
import { READ_ONLY_MESSAGE, readOnlyBlock } from "@/lib/subscription";

type Failure = { ok: false; message: string };

/** Read-only accounts and known file errors become a message; anything else is a real error. */
async function run<T>(fn: () => Promise<T>): Promise<({ ok: true } & T) | Failure> {
  if (await readOnlyBlock()) return { ok: false, message: READ_ONLY_MESSAGE };
  try {
    return { ok: true, ...(await fn()) };
  } catch (error) {
    if (error instanceof FileError) return { ok: false, message: error.message };
    throw error;
  }
}

interface FileInput {
  entityType: FileEntityType;
  entityId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export async function prepareFileUpload(input: FileInput) {
  return run(() => prepareUpload(input));
}

export async function confirmFileUpload(input: FileInput & { path: string }) {
  return run(async () => {
    await confirmUpload(input);
    // Attachments show on several pages (contract, movement, client, property).
    revalidatePath("/", "layout");
    return {};
  });
}

export async function removeFile(fileId: string) {
  return run(async () => {
    await deleteFile(fileId);
    revalidatePath("/", "layout");
    return {};
  });
}
