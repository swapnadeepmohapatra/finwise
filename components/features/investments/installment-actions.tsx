"use client";

import { useState } from "react";
import { toast } from "sonner";
import { markInstallmentPaid, markInstallmentSkipped } from "@/lib/actions/sips";
import { formatPaise } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/dates";
import { useActionForm } from "@/components/features/use-action-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

export type BankAccountOption = { id: string; name: string };

export type UpcomingInstallmentItem = {
  id: string;
  dueDate: string;
  amountPaise: number;
  sipName: string;
  linkedToHolding: boolean;
};

export function InstallmentActions({
  installment,
  bankAccounts,
}: {
  installment: UpcomingInstallmentItem;
  bankAccounts: BankAccountOption[];
}) {
  const [paidOpen, setPaidOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="outline" onClick={() => setPaidOpen(true)}>
        Mark paid
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={async () => {
          await markInstallmentSkipped(installment.id);
          toast.success("Installment skipped");
        }}
      >
        Skip
      </Button>

      <Dialog open={paidOpen} onOpenChange={setPaidOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark installment paid</DialogTitle>
          </DialogHeader>
          {paidOpen ? (
            <MarkPaidForm
              installment={installment}
              bankAccounts={bankAccounts}
              onDone={() => setPaidOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MarkPaidForm({
  installment,
  bankAccounts,
  onDone,
}: {
  installment: UpcomingInstallmentItem;
  bankAccounts: BankAccountOption[];
  onDone: () => void;
}) {
  const { state, formAction, pending } = useActionForm(markInstallmentPaid, {
    onSuccess: onDone,
    successMessage: "Installment marked paid",
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={installment.id} />
      <p className="text-sm text-muted-foreground">
        {installment.sipName} — {formatPaise(installment.amountPaise)} due{" "}
        {formatDate(installment.dueDate)}
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="units">Units (optional)</Label>
          <Input id="units" name="units" inputMode="decimal" placeholder="12.3456" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="nav">NAV (optional)</Label>
          <Input id="nav" name="nav" inputMode="decimal" placeholder="45.12" />
        </div>
      </div>
      {installment.linkedToHolding ? (
        <p className="text-xs text-muted-foreground">
          Units entered here roll into the linked MF holding.
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label>Debit from account (optional)</Label>
        <Select name="debitAccountId" defaultValue="none">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None — no transaction</SelectItem>
            {bankAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Choosing an account records an expense transaction for this SIP.
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
