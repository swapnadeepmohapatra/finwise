"use client";

import { useState } from "react";
import type { CreditCardBill } from "@/lib/db/schema";
import { markBillPaid } from "@/lib/actions/bills";
import { formatPaise } from "@/lib/utils/money";
import { todayIST } from "@/lib/utils/dates";
import { useActionForm } from "@/components/features/use-action-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type BankOption = { id: string; name: string };

export function PayDialog({
  bill,
  cardName,
  bankAccounts,
  trigger,
}: {
  bill: CreditCardBill;
  cardName: string;
  bankAccounts: BankOption[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Pay {cardName} bill</DialogTitle>
        </DialogHeader>
        {open ? (
          <PayForm
            bill={bill}
            bankAccounts={bankAccounts}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PayForm({
  bill,
  bankAccounts,
  onDone,
}: {
  bill: CreditCardBill;
  bankAccounts: BankOption[];
  onDone: () => void;
}) {
  const { state, formAction, pending } = useActionForm(markBillPaid, {
    onSuccess: onDone,
    successMessage: "Payment recorded",
  });

  const remainingPaise = Math.max(bill.totalDuePaise - bill.paidPaise, 0);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={bill.id} />

      <p className="text-sm text-muted-foreground">
        Remaining due{" "}
        <span className="font-mono tabular-nums text-foreground">
          {formatPaise(remainingPaise)}
        </span>
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="amountPaid">Amount (₹)</Label>
          <Input
            id="amountPaid"
            name="amountPaid"
            inputMode="decimal"
            defaultValue={remainingPaise > 0 ? (remainingPaise / 100).toString() : ""}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="paidDate">Paid on</Label>
          <Input
            id="paidDate"
            name="paidDate"
            type="date"
            defaultValue={todayIST()}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Pay from</Label>
        <Select name="fromAccountId" defaultValue="none">
          <SelectTrigger>
            <SelectValue placeholder="Select bank account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Don&apos;t record a transfer</SelectItem>
            {bankAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Choosing a bank account records a transfer and reduces its balance.
        </p>
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Mark paid"}
      </Button>
    </form>
  );
}
