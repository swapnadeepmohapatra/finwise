"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import type { AccountOption } from "@/components/features/transactions/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DOC_TYPES = [
  { value: "bank_statement", label: "Bank statement" },
  { value: "credit_card_statement", label: "Credit card statement" },
  { value: "payslip", label: "Payslip" },
  { value: "other", label: "Other document" },
] as const;

export function UploadForm({ accounts }: { accounts: AccountOption[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<string>("bank_statement");
  const [accountId, setAccountId] = useState<string>("none");
  const [phase, setPhase] = useState<"idle" | "uploading" | "extracting">("idle");

  const accountOptions =
    docType === "bank_statement"
      ? accounts.filter((a) => a.type === "bank")
      : docType === "credit_card_statement"
        ? accounts.filter((a) => a.type === "credit_card")
        : [];

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Choose a file first");
      return;
    }

    setPhase("uploading");
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("docType", docType);
      formData.set("linkedAccountId", accountId);
      const uploadRes = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadJson.error ?? "Upload failed");
      const docId: string = uploadJson.id;

      if (docType === "other") {
        toast.success("Document uploaded");
        router.refresh();
        return;
      }

      setPhase("extracting");
      const extractRes = await fetch(`/api/documents/${docId}/extract`, {
        method: "POST",
      });
      if (!extractRes.ok) {
        const j = await extractRes.json().catch(() => ({}));
        throw new Error(j.error ?? "Extraction failed — you can retry from the list");
      }
      toast.success("Extracted — review the results");
      router.push(`/documents/${docId}/review`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      router.refresh();
    } finally {
      setPhase("idle");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upload a document</CardTitle>
        <CardDescription>
          Bank statements, credit card statements and payslips are parsed with AI —
          you review every row before anything is saved.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr_1.5fr_auto]">
        <div className="flex flex-col gap-2">
          <Label>Document type</Label>
          <Select
            value={docType}
            onValueChange={(v) => {
              setDocType(v);
              setAccountId("none");
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {accountOptions.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label>Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Choose later</SelectItem>
                {accountOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="hidden md:block" />
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="file">File (PDF, CSV or image, max 15 MB)</Label>
          <Input
            id="file"
            ref={fileRef}
            type="file"
            accept=".pdf,.csv,image/png,image/jpeg,image/webp"
          />
        </div>
        <div className="flex items-end">
          <Button onClick={handleUpload} disabled={phase !== "idle"} className="w-full md:w-auto">
            {phase === "idle" ? (
              <>
                <FileUp className="h-4 w-4" /> Upload
              </>
            ) : (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {phase === "uploading" ? "Uploading…" : "Extracting…"}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
