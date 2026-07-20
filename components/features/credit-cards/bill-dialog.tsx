"use client";

import { useState } from "react";
import type { CreditCardBill } from "@/lib/db/schema";
import { createBill, updateBill } from "@/lib/actions/bills";
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

export type CardOption = { id: string; name: string };

export function BillDialog({
  bill,
  cards,
  trigger,
}: {
  bill?: CreditCardBill;
  cards: CardOption[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{bill ? "Edit bill" : "Add bill"}</DialogTitle>
        </DialogHeader>
        {open ? (
          <BillForm bill={bill} cards={cards} onDone={() => setOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function BillForm({
  bill,
  cards,
  onDone,
}: {
  bill?: CreditCardBill;
  cards: CardOption[];
  onDone: () => void;
}) {
  const { state, formAction, pending } = useActionForm(
    bill ? updateBill : createBill,
    {
      onSuccess: onDone,
      successMessage: bill ? "Bill updated" : "Bill added",
    },
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {bill ? <input type="hidden" name="id" value={bill.id} /> : null}

      <div className="flex flex-col gap-2">
        <Label>Credit card</Label>
        <Select name="accountId" defaultValue={bill?.accountId ?? cards[0]?.id}>
          <SelectTrigger>
            <SelectValue placeholder="Select credit card" />
          </SelectTrigger>
          <SelectContent>
            {cards.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="statementDate">Statement date</Label>
          <Input
            id="statementDate"
            name="statementDate"
            type="date"
            defaultValue={bill?.statementDate ?? todayIST()}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="dueDate">Due date</Label>
          <Input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={bill?.dueDate ?? ""}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="periodStart">Period start</Label>
          <Input
            id="periodStart"
            name="periodStart"
            type="date"
            defaultValue={bill?.periodStart ?? ""}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="periodEnd">Period end</Label>
          <Input
            id="periodEnd"
            name="periodEnd"
            type="date"
            defaultValue={bill?.periodEnd ?? ""}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="totalDue">Total due (₹)</Label>
          <Input
            id="totalDue"
            name="totalDue"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={bill ? (bill.totalDuePaise / 100).toString() : ""}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="minDue">Minimum due (₹)</Label>
          <Input
            id="minDue"
            name="minDue"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={
              bill?.minDuePaise != null ? (bill.minDuePaise / 100).toString() : ""
            }
          />
        </div>
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : bill ? "Save changes" : "Add bill"}
      </Button>
    </form>
  );
}
