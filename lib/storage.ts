import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

/**
 * File storage abstraction: Vercel Blob when BLOB_READ_WRITE_TOKEN is set,
 * local disk (.uploads/, gitignored) otherwise — so the whole document flow
 * works in local dev without any cloud provisioning.
 */

const UPLOADS_DIR = path.join(process.cwd(), ".uploads");

export type StoredFile = { url: string; pathname: string };

function useBlob() {
  // Real tokens look like "vercel_blob_rw_…" — guard so a placeholder value
  // can't silently switch local dev into (broken) cloud-storage mode.
  return !!process.env.BLOB_READ_WRITE_TOKEN?.startsWith("vercel_blob_rw_");
}

export async function saveUpload(file: File): Promise<StoredFile> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const pathname = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;

  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`documents/${pathname}`, buffer, {
      access: "public",
      contentType: file.type || "application/octet-stream",
    });
    return { url: blob.url, pathname: blob.pathname };
  }

  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(path.join(UPLOADS_DIR, pathname), buffer);
  return { url: `/api/files/${pathname}`, pathname };
}

/** Resolve a stored file to bytes (works for both blob URLs and local files). */
export async function readUpload(stored: {
  blobUrl: string;
  blobPathname: string;
}): Promise<Buffer> {
  if (stored.blobUrl.startsWith("http")) {
    const res = await fetch(stored.blobUrl);
    if (!res.ok) throw new Error(`Failed to fetch stored file (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readLocalUpload(stored.blobPathname);
}

/** Read a local upload by pathname, guarding against path traversal. */
export async function readLocalUpload(pathname: string): Promise<Buffer> {
  const resolved = path.join(UPLOADS_DIR, path.basename(pathname));
  return readFile(resolved);
}

export async function deleteUpload(stored: {
  blobUrl: string;
  blobPathname: string;
}): Promise<void> {
  try {
    if (stored.blobUrl.startsWith("http") && useBlob()) {
      const { del } = await import("@vercel/blob");
      await del(stored.blobUrl);
    } else {
      await rm(path.join(UPLOADS_DIR, path.basename(stored.blobPathname)), {
        force: true,
      });
    }
  } catch (err) {
    // Losing an orphaned file is acceptable; failing the user action is not.
    console.error(
      JSON.stringify({
        level: "error",
        msg: "delete-upload-failed",
        pathname: stored.blobPathname,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
