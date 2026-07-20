"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Loader2, MoreVertical } from "lucide-react";
import { deleteDocument, discardExtraction } from "@/lib/actions/documents";
import { formatDate } from "@/lib/utils/dates";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type DocListItem = {
  id: string;
  fileName: string;
  blobUrl: string;
  docType: string;
  status: string;
  extractionError: string | null;
  uploadedAt: string; // ISO
  accountName: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  bank_statement: "Bank statement",
  credit_card_statement: "CC statement",
  payslip: "Payslip",
  other: "Other",
};

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "uploaded":
      return <Badge variant="outline">Uploaded</Badge>;
    case "extracting":
      return (
        <Badge variant="secondary">
          <Loader2 className="h-3 w-3 animate-spin" /> Extracting
        </Badge>
      );
    case "extracted":
      return <Badge className="bg-amber-500/15 text-amber-500">Needs review</Badge>;
    case "committed":
      return <Badge className="bg-emerald-500/15 text-emerald-500">Committed</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function DocumentsTable({ docs }: { docs: DocListItem[] }) {
  const router = useRouter();
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DocListItem | undefined>();

  async function runExtract(doc: DocListItem) {
    setExtractingId(doc.id);
    router.refresh();
    try {
      const res = await fetch(`/api/documents/${doc.id}/extract`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Extraction failed");
      toast.success("Extracted — review the results");
      router.push(`/documents/${doc.id}/review`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtractingId(null);
      router.refresh();
    }
  }

  if (docs.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No documents yet — upload your first statement or payslip above.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {docs.map((doc) => {
          const busy = extractingId === doc.id || doc.status === "extracting";
          return (
            <Card key={doc.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{doc.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {TYPE_LABELS[doc.docType] ?? doc.docType}
                    {doc.accountName ? ` · ${doc.accountName}` : ""} ·{" "}
                    {formatDate(doc.uploadedAt.slice(0, 10))}
                  </p>
                  {doc.status === "failed" && doc.extractionError ? (
                    <p className="mt-1 line-clamp-2 text-xs text-destructive">
                      {doc.extractionError}
                    </p>
                  ) : null}
                </div>
                <StatusBadge status={busy ? "extracting" : doc.status} />
                {doc.status === "extracted" ? (
                  <Button size="sm" asChild>
                    <Link href={`/documents/${doc.id}/review`}>Review</Link>
                  </Button>
                ) : null}
                {(doc.status === "uploaded" || doc.status === "failed") &&
                doc.docType !== "other" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => runExtract(doc)}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {doc.status === "failed" ? "Retry" : "Extract"}
                  </Button>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                      <span className="sr-only">Document actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <a href={doc.blobUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" /> View file
                      </a>
                    </DropdownMenuItem>
                    {doc.status === "extracted" ? (
                      <DropdownMenuItem
                        onSelect={async () => {
                          await discardExtraction(doc.id);
                          toast.success("Extraction discarded");
                        }}
                      >
                        Discard extraction
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setDeleting(doc)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.fileName}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The file is removed. Transactions already committed from it are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleting) return;
                await deleteDocument(deleting.id);
                setDeleting(undefined);
                toast.success("Document deleted");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
