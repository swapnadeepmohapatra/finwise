"use client";

import { useState } from "react";
import {
  createTransaction,
  updateTransaction,
} from "@/lib/actions/transactions";
import { todayIST } from "@/lib/utils/dates";
import { useActionForm } from "@/components/features/use-action-form";
import type { AccountOption, CategoryOption, TxnListItem } from "./types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export function TransactionForm({
  txn,
  accounts,
  categories,
  onDone,
}: {
  txn?: TxnListItem;
  accounts: AccountOption[];
  categories: CategoryOption[];
  onDone: () => void;
}) {
  const [type, setType] = useState<TxnListItem["type"]>(txn?.type ?? "expense");
  const { state, formAction, pending } = useActionForm(
    txn ? updateTransaction : createTransaction,
    {
      onSuccess: onDone,
      successMessage: txn ? "Transaction updated" : "Transaction added",
    },
  );

  const visibleCategories = categories.filter((c) =>
    type === "income" ? c.kind === "income" : c.kind === "expense",
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {txn ? <input type="hidden" name="id" value={txn.id} /> : null}
      <input type="hidden" name="type" value={type} />

      <Tabs value={type} onValueChange={(v) => setType(v as TxnListItem["type"])}>
        <TabsList className="w-full">
          <TabsTrigger value="expense" className="flex-1">
            Expense
          </TabsTrigger>
          <TabsTrigger value="income" className="flex-1">
            Income
          </TabsTrigger>
          <TabsTrigger value="transfer" className="flex-1">
            Transfer
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="amount">Amount (₹)</Label>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={txn ? (txn.amountPaise / 100).toString() : ""}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            name="date"
            type="date"
            defaultValue={txn?.date ?? todayIST()}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{type === "transfer" ? "From account" : "Account"}</Label>
        <Select name="accountId" defaultValue={txn?.accountId ?? accounts[0]?.id}>
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

      {type === "transfer" ? (
        <div className="flex flex-col gap-2">
          <Label>To account</Label>
          <Select
            name="counterAccountId"
            defaultValue={txn?.counterAccountId ?? undefined}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select destination" />
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
      ) : (
        <div className="flex flex-col gap-2">
          <Label>Category</Label>
          <Select
            name="categoryId"
            defaultValue={
              txn?.categoryId &&
              visibleCategories.some((c) => c.id === txn.categoryId)
                ? txn.categoryId
                : undefined
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Uncategorised</SelectItem>
              {visibleCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          name="description"
          defaultValue={txn?.description ?? ""}
          placeholder="UPI — Swiggy order"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="merchant">Merchant</Label>
          <Input
            id="merchant"
            name="merchant"
            defaultValue={txn?.merchant ?? ""}
            placeholder="Swiggy"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            defaultValue={txn?.notes ?? ""}
            rows={1}
          />
        </div>
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : txn ? "Save changes" : "Add transaction"}
      </Button>
    </form>
  );
}
