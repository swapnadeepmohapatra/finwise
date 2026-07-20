"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { commitStatementExtraction } from "@/lib/actions/documents";
import { useActionForm } from "@/components/features/use-action-form";
import type {
  BankStatementExtraction,
  CcStatementExtraction,
} from "@/lib/ai/extraction/schemas";
import type {
  AccountOption,
  CategoryOption,
} from "@/components/features/transactions/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ReviewRow = {
  date: string;
  description: string;
  merchant: string | null;
  direction: "credit" | "debit";
  amount: number;
  categoryName: string | null;
  include: boolean;
};

export function StatementReview({
  documentId,
  fileName,
  isCcStatement,
  data,
  accounts,
  categories,
  linkedAccountId,
  duplicateIndexes,
  rowFlags,
}: {
  documentId: string;
  fileName: string;
  isCcStatement: boolean;
  data: BankStatementExtraction | CcStatementExtraction;
  accounts: AccountOption[];
  categories: CategoryOption[];
  linkedAccountId: string | null;
  duplicateIndexes: number[];
  rowFlags?: { index: number; flags: string[] }[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ReviewRow[]>(() =>
    data.transactions.map((t) => ({
      date: t.date,
      description: t.description,
      merchant: t.merchant ?? null,
      direction: t.direction,
      amount: t.amount,
      categoryName: t.suggestedCategory ?? null,
      include: true,
    })),
  );
  const [accountId, setAccountId] = useState<string>(
    linkedAccountId ?? accounts[0]?.id ?? "none",
  );
  const [createBill, setCreateBill] = useState(isCcStatement);
  const dupes = useMemo(() => new Set(duplicateIndexes), [duplicateIndexes]);
  const flagsByIndex = useMemo(
    () => new Map((rowFlags ?? []).map((f) => [f.index, f.flags])),
    [rowFlags],
  );

  const { state, formAction, pending } = useActionForm(commitStatementExtraction, {
    onSuccess: () => {
      toast.success("Committed to your transactions");
      router.push("/documents");
      router.refresh();
    },
  });

  const cc = isCcStatement ? (data as CcStatementExtraction) : null;
  const bank = !isCcStatement ? (data as BankStatementExtraction) : null;

  const selected = rows.filter((r) => r.include);
  const totalIn = selected
    .filter((r) => r.direction === "credit")
    .reduce((s, r) => s + r.amount, 0);
  const totalOut = selected
    .filter((r) => r.direction === "debit")
    .reduce((s, r) => s + r.amount, 0);

  const update = (i: number, patch: Partial<ReviewRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const billInfo =
    cc && cc.totalDue && cc.statementDate && cc.dueDate
      ? {
          statementDate: cc.statementDate,
          dueDate: cc.dueDate,
          periodFrom: cc.periodFrom ?? null,
          periodTo: cc.periodTo ?? null,
          totalDue: cc.totalDue,
          minDue: cc.minDue ?? null,
        }
      : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="rows" value={JSON.stringify(rows)} />
      {createBill && billInfo ? (
        <input type="hidden" name="bill" value={JSON.stringify(billInfo)} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Review — {fileName}
          </CardTitle>
          <CardDescription>
            {[
              cc?.issuer ?? bank?.bankName,
              (cc?.cardLast4 ?? bank?.accountLast4) &&
                `•••• ${cc?.cardLast4 ?? bank?.accountLast4}`,
              bank?.periodFrom && bank?.periodTo
                ? `${bank.periodFrom} → ${bank.periodTo}`
                : cc?.periodFrom && cc?.periodTo
                  ? `${cc.periodFrom} → ${cc.periodTo}`
                  : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Check every row before committing."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex min-w-56 flex-col gap-2">
            <Label>Commit to account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <Checkbox name="skipDuplicates" defaultChecked />
            Skip duplicates already in Finwise
          </label>
          {isCcStatement && billInfo ? (
            <label className="flex items-center gap-2 pb-2 text-sm">
              <Checkbox
                checked={createBill}
                onCheckedChange={(v) => setCreateBill(v === true)}
              />
              Also create the ₹{billInfo.totalDue.toLocaleString("en-IN")} bill (due{" "}
              {billInfo.dueDate})
            </label>
          ) : null}
        </CardContent>
      </Card>

      <Card className="py-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={rows.every((r) => r.include)}
                    onCheckedChange={(v) =>
                      setRows((prev) => prev.map((r) => ({ ...r, include: v === true })))
                    }
                  />
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="min-w-64">Description</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Amount (₹)</TableHead>
                <TableHead className="min-w-44">Category</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i} className={row.include ? "" : "opacity-50"}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Checkbox
                        checked={row.include}
                        onCheckedChange={(v) => update(i, { include: v === true })}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      className="w-36"
                      value={row.date}
                      onChange={(e) => update(i, { date: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.description}
                      onChange={(e) => update(i, { description: e.target.value })}
                    />
                    {dupes.has(i) || flagsByIndex.has(i) ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {dupes.has(i) ? (
                          <Badge className="bg-amber-500/15 text-amber-500">
                            Possible duplicate
                          </Badge>
                        ) : null}
                        {flagsByIndex.get(i)?.includes("large") ? (
                          <Badge className="bg-amber-500/15 text-amber-500">
                            Large
                          </Badge>
                        ) : null}
                        {flagsByIndex.get(i)?.includes("subscription") ? (
                          <Badge className="bg-blue-500/15 text-blue-500">
                            Recurring
                          </Badge>
                        ) : null}
                        {flagsByIndex.get(i)?.includes("fee") ? (
                          <Badge className="bg-red-500/15 text-red-500">
                            Fee
                          </Badge>
                        ) : null}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={row.direction}
                      onValueChange={(v) =>
                        update(i, { direction: v as "credit" | "debit" })
                      }
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="debit">Debit</SelectItem>
                        <SelectItem value="credit">Credit</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      inputMode="decimal"
                      className="w-28 text-right font-mono"
                      value={String(row.amount)}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        update(i, { amount: Number.isNaN(n) ? 0 : n });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={row.categoryName ?? "none"}
                      onValueChange={(v) =>
                        update(i, { categoryName: v === "none" ? null : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Uncategorised</SelectItem>
                        {categories
                          .filter((c) =>
                            row.direction === "credit"
                              ? c.kind === "income"
                              : c.kind === "expense",
                          )
                          .map((c) => (
                            <SelectItem key={c.id} value={c.name}>
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {state.error && !state.success ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="sticky bottom-16 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4 md:bottom-4">
        <p className="text-sm text-muted-foreground">
          {selected.length} of {rows.length} rows selected · in ₹
          {totalIn.toLocaleString("en-IN")} · out ₹{totalOut.toLocaleString("en-IN")}
        </p>
        <Button type="submit" disabled={pending || selected.length === 0}>
          {pending ? "Committing…" : `Commit ${selected.length} rows`}
        </Button>
      </div>
    </form>
  );
}
