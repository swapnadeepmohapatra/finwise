"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoreVertical, Plus } from "lucide-react";
import { deleteTransaction } from "@/lib/actions/transactions";
import { formatPaise } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/dates";
import { TransactionForm } from "./transaction-form";
import type { AccountOption, CategoryOption, TxnListItem } from "./types";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function Amount({ txn }: { txn: TxnListItem }) {
  return (
    <span
      className={`font-mono tabular-nums ${
        txn.type === "income"
          ? "text-emerald-500"
          : txn.type === "transfer"
            ? "text-muted-foreground"
            : ""
      }`}
    >
      {txn.type === "income" ? "+" : txn.type === "expense" ? "−" : ""}
      {formatPaise(txn.amountPaise)}
    </span>
  );
}

export function TransactionsView({
  txns,
  accounts,
  categories,
}: {
  txns: TxnListItem[];
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TxnListItem | undefined>();
  const [deleting, setDeleting] = useState<TxnListItem | undefined>();

  const openCreate = () => {
    setEditing(undefined);
    setSheetOpen(true);
  };
  const openEdit = (txn: TxnListItem) => {
    setEditing(txn);
    setSheetOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add transaction
        </Button>
      </div>

      {txns.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No transactions match these filters.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden py-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {txns.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => openEdit(t)}
                  >
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(t.date)}
                    </TableCell>
                    <TableCell>
                      <p className="max-w-72 truncate font-medium">{t.description}</p>
                      {t.merchant ? (
                        <p className="text-xs text-muted-foreground">{t.merchant}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {t.type === "transfer" ? (
                        <Badge variant="outline">
                          → {t.counterAccountName ?? "Transfer"}
                        </Badge>
                      ) : t.categoryName ? (
                        <Badge
                          variant="secondary"
                          style={
                            t.categoryColor
                              ? { backgroundColor: `${t.categoryColor}22` }
                              : undefined
                          }
                        >
                          {t.categoryName}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.accountName}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount txn={t} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <RowMenu txn={t} onEdit={openEdit} onDelete={setDeleting} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2 md:hidden">
            {txns.map((t) => (
              <Card key={t.id} onClick={() => openEdit(t)}>
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(t.date)} · {t.accountName}
                      {t.categoryName ? ` · ${t.categoryName}` : ""}
                    </p>
                  </div>
                  <Amount txn={t} />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit transaction" : "Add transaction"}</SheetTitle>
          </SheetHeader>
          {sheetOpen ? (
            <div className="px-4 pb-6">
              <TransactionForm
                txn={editing}
                accounts={accounts}
                categories={categories}
                onDone={() => setSheetOpen(false)}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.description}” ({deleting ? formatPaise(deleting.amountPaise) : ""})
              will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleting) return;
                await deleteTransaction(deleting.id);
                setDeleting(undefined);
                toast.success("Transaction deleted");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RowMenu({
  txn,
  onEdit,
  onDelete,
}: {
  txn: TxnListItem;
  onEdit: (t: TxnListItem) => void;
  onDelete: (t: TxnListItem) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Transaction actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(txn)}>Edit</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(txn)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
