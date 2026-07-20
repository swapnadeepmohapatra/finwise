import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { isApiAuthenticated } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { extractDocument } from "@/lib/ai/extraction/extract";
import { hasGeminiKey } from "@/lib/ai/models";

export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isApiAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasGeminiKey()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set — add it to .env.local to enable extraction" },
      { status: 503 },
    );
  }

  const { id } = await params;
  const db = getDb();
  const doc = await db.query.documents.findFirst({
    where: (d, { eq: eqOp }) => eqOp(d.id, id),
  });
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  if (doc.status === "extracting") {
    return NextResponse.json({ error: "Extraction already running" }, { status: 409 });
  }
  if (doc.status === "committed") {
    return NextResponse.json({ error: "Document already committed" }, { status: 409 });
  }

  const start = Date.now();
  console.log(
    JSON.stringify({ level: "info", msg: "extract-start", docId: id, docType: doc.docType }),
  );
  await db
    .update(documents)
    .set({ status: "extracting", extractionError: null })
    .where(eq(documents.id, id));

  try {
    const output = await extractDocument(doc);
    await db
      .update(documents)
      .set({
        status: "extracted",
        extractionJson: output,
        extractedAt: new Date(),
        extractionError: null,
      })
      .where(eq(documents.id, id));
    console.log(
      JSON.stringify({
        level: "info",
        msg: "extract-done",
        docId: id,
        ms: Date.now() - start,
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        level: "error",
        msg: "extract-failed",
        docId: id,
        error: message,
        ms: Date.now() - start,
      }),
    );
    await db
      .update(documents)
      .set({ status: "failed", extractionError: message })
      .where(eq(documents.id, id));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
