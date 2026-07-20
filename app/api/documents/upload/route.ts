import { NextResponse } from "next/server";
import { isApiAuthenticated } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { saveUpload } from "@/lib/storage";

export const maxDuration = 60;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const MAX_SIZE_BYTES = 15 * 1024 * 1024;
const DOC_TYPES = new Set([
  "bank_statement",
  "credit_card_statement",
  "payslip",
  "other",
]);

export async function POST(req: Request) {
  if (!(await isApiAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const docType = formData.get("docType");
  const linkedAccountId = formData.get("linkedAccountId");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (typeof docType !== "string" || !DOC_TYPES.has(docType)) {
    return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Only PDF, CSV, PNG, JPEG and WebP files are supported" },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File is larger than 15 MB" }, { status: 400 });
  }

  const stored = await saveUpload(file);
  const [doc] = await getDb()
    .insert(documents)
    .values({
      fileName: file.name,
      blobUrl: stored.url,
      blobPathname: stored.pathname,
      mimeType: file.type,
      sizeBytes: file.size,
      docType: docType as "bank_statement" | "credit_card_statement" | "payslip" | "other",
      linkedAccountId:
        typeof linkedAccountId === "string" && linkedAccountId && linkedAccountId !== "none"
          ? linkedAccountId
          : null,
    })
    .returning();

  return NextResponse.json({ id: doc.id });
}
