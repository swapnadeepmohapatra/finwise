import type { Metadata } from "next";
import { asc, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accounts, documents } from "@/lib/db/schema";
import { UploadForm } from "@/components/features/documents/upload-form";
import {
  DocumentsTable,
  type DocListItem,
} from "@/components/features/documents/documents-table";

export const metadata: Metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const db = getDb();
  const [docs, accountRows] = await Promise.all([
    db.query.documents.findMany({
      with: { linkedAccount: true },
      orderBy: [desc(documents.uploadedAt)],
    }),
    db.select().from(accounts).orderBy(asc(accounts.name)),
  ]);

  const items: DocListItem[] = docs.map((d) => ({
    id: d.id,
    fileName: d.fileName,
    blobUrl: d.blobUrl,
    docType: d.docType,
    status: d.status,
    extractionError: d.extractionError,
    uploadedAt: d.uploadedAt.toISOString(),
    accountName: d.linkedAccount?.name ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
      <UploadForm
        accounts={accountRows.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
      />
      <DocumentsTable docs={items} />
    </div>
  );
}
