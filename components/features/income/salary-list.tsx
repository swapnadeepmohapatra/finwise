"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoreVertical } from "lucide-react";
import type { Account, SalaryEntry } from "@/lib/db/schema";
import { deleteSalaryEntry } from "@/lib/actions/salary";
import { formatPaise } from "@/lib/utils/money";
import { formatMonth } from "@/lib/utils/dates";
import { SalaryDialog, type AccountOption } from "./salary-dialog";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

export type SalaryEntryWithAccount = SalaryEntry & {
  creditedAccount: Account | null;
};

type BreakdownRow = { label: string; paise: number };

function presentRows(
  items: { label: string; paise: number | null | undefined }[],
): BreakdownRow[] {
  return items.flatMap((i) =>
    i.paise != null ? [{ label: i.label, paise: i.paise }] : [],
  );
}

function earningRows(entry: SalaryEntryWithAccount): BreakdownRow[] {
  return presentRows([
    { label: "Basic", paise: entry.basicPaise },
    { label: "HRA", paise: entry.hraPaise },
    { label: "Special allowance", paise: entry.specialAllowancePaise },
    ...(entry.otherEarnings ?? []).map((e) => ({
      label: e.label,
      paise: e.amountPaise,
    })),
  ]);
}

function deductionRows(entry: SalaryEntryWithAccount): BreakdownRow[] {
  return presentRows([
    { label: "Provident fund", paise: entry.pfPaise },
    { label: "Professional tax", paise: entry.professionalTaxPaise },
    { label: "Income tax", paise: entry.incomeTaxPaise },
    ...(entry.otherDeductions ?? []).map((d) => ({
      label: d.label,
      paise: d.amountPaise,
    })),
  ]);
}

function totalDeductionsPaise(entry: SalaryEntryWithAccount): number {
  return deductionRows(entry).reduce((sum, row) => sum + row.paise, 0);
}

export function SalaryList({
  entries,
  accounts,
}: {
  entries: SalaryEntryWithAccount[];
  accounts: AccountOption[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry) => (
        <SalaryCard key={entry.id} entry={entry} accounts={accounts} />
      ))}
    </div>
  );
}

function SalaryCard({
  entry,
  accounts,
}: {
  entry: SalaryEntryWithAccount;
  accounts: AccountOption[];
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deductions = totalDeductionsPaise(entry);

  return (
    <>
      <Card>
        <CardContent className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="font-medium">{formatMonth(entry.month)}</p>
            <p className="truncate text-sm text-muted-foreground">
              {[entry.employer, entry.creditedAccount?.name]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="pt-2 font-mono text-lg tabular-nums">
              {formatPaise(entry.netPaise)}
            </p>
            <p className="font-mono text-sm tabular-nums text-muted-foreground">
              {formatPaise(entry.grossPaise)} gross · {formatPaise(deductions)}{" "}
              deductions
            </p>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Salary entry actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDetailsOpen(true)}>
                View details
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>

      {/* Details */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {formatMonth(entry.month)} — {entry.employer}
            </DialogTitle>
          </DialogHeader>
          <BreakdownTable entry={entry} />
          {entry.creditedAccount ? (
            <p className="text-sm text-muted-foreground">
              Credited to {entry.creditedAccount.name}
            </p>
          ) : null}
          {entry.notes ? (
            <p className="text-sm text-muted-foreground">{entry.notes}</p>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Edit (controlled, no trigger) */}
      <SalaryDialog
        entry={entry}
        accounts={accounts}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      {/* Delete */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {formatMonth(entry.month)} salary entry?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {entry.transactionId
                ? "This removes the salary entry and its linked credit transaction. This cannot be undone."
                : "This permanently removes the salary entry. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await deleteSalaryEntry(entry.id);
                toast.success("Salary entry deleted");
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

function AmountCell({ paise }: { paise: number }) {
  return (
    <TableCell className="text-right font-mono tabular-nums">
      {formatPaise(paise)}
    </TableCell>
  );
}

function SectionRow({ label }: { label: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={2} className="text-xs font-medium text-muted-foreground">
        {label}
      </TableCell>
    </TableRow>
  );
}

function BreakdownTable({ entry }: { entry: SalaryEntryWithAccount }) {
  const earnings = earningRows(entry);
  const deductions = deductionRows(entry);

  return (
    <Table>
      <TableBody>
        <SectionRow label="Earnings" />
        {earnings.map((row) => (
          <TableRow key={`e-${row.label}`}>
            <TableCell>{row.label}</TableCell>
            <AmountCell paise={row.paise} />
          </TableRow>
        ))}
        <TableRow>
          <TableCell className="font-medium">Gross</TableCell>
          <AmountCell paise={entry.grossPaise} />
        </TableRow>

        <SectionRow label="Deductions" />
        {deductions.length > 0 ? (
          deductions.map((row) => (
            <TableRow key={`d-${row.label}`}>
              <TableCell>{row.label}</TableCell>
              <AmountCell paise={row.paise} />
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={2} className="text-muted-foreground">
              None recorded
            </TableCell>
          </TableRow>
        )}
        {deductions.length > 0 ? (
          <TableRow>
            <TableCell className="font-medium">Total deductions</TableCell>
            <AmountCell paise={totalDeductionsPaise(entry)} />
          </TableRow>
        ) : null}

        <TableRow>
          <TableCell className="font-medium">Net pay</TableCell>
          <AmountCell paise={entry.netPaise} />
        </TableRow>
      </TableBody>
    </Table>
  );
}
