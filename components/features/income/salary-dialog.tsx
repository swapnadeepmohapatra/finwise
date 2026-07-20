"use client";

import { useState } from "react";
import type { SalaryEntry } from "@/lib/db/schema";
import { createSalaryEntry, updateSalaryEntry } from "@/lib/actions/salary";
import { useActionForm } from "@/components/features/use-action-form";
import { monthStart } from "@/lib/utils/dates";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";

export type AccountOption = { id: string; name: string };

export function SalaryDialog({
  entry,
  accounts,
  trigger,
  open,
  onOpenChange,
}: {
  entry?: SalaryEntry;
  accounts: AccountOption[];
  /** Uncontrolled usage: pass a trigger. Controlled usage: pass open/onOpenChange. */
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit salary entry" : "Add salary entry"}</DialogTitle>
        </DialogHeader>
        {/* Mount only while open so useActionState resets per open */}
        {isOpen ? (
          <SalaryFormInner
            entry={entry}
            accounts={accounts}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AmountField({
  name,
  label,
  defaultPaise,
  required,
}: {
  name: string;
  label: string;
  defaultPaise?: number | null;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        inputMode="decimal"
        placeholder="0.00"
        defaultValue={defaultPaise != null ? (defaultPaise / 100).toString() : ""}
        required={required}
      />
    </div>
  );
}

function SalaryFormInner({
  entry,
  accounts,
  onDone,
}: {
  entry?: SalaryEntry;
  accounts: AccountOption[];
  onDone: () => void;
}) {
  const [month, setMonth] = useState(
    entry ? entry.month.slice(0, 7) : monthStart().slice(0, 7),
  );
  const { state, formAction, pending } = useActionForm(
    entry ? updateSalaryEntry : createSalaryEntry,
    {
      onSuccess: onDone,
      successMessage: entry ? "Salary entry updated" : "Salary entry added",
    },
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="month">Month</Label>
          <Input
            id="month"
            name="month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="employer">Employer</Label>
          <Input
            id="employer"
            name="employer"
            defaultValue={entry?.employer}
            placeholder="Acme Tech"
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Earnings</p>
        <div className="grid grid-cols-2 gap-4">
          <AmountField
            name="gross"
            label="Gross (₹)"
            defaultPaise={entry?.grossPaise}
            required
          />
          <AmountField name="basic" label="Basic (₹)" defaultPaise={entry?.basicPaise} />
          <AmountField name="hra" label="HRA (₹)" defaultPaise={entry?.hraPaise} />
          <AmountField
            name="specialAllowance"
            label="Special allowance (₹)"
            defaultPaise={entry?.specialAllowancePaise}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Deductions</p>
        <div className="grid grid-cols-2 gap-4">
          <AmountField name="pf" label="PF (₹)" defaultPaise={entry?.pfPaise} />
          <AmountField
            name="professionalTax"
            label="Professional tax (₹)"
            defaultPaise={entry?.professionalTaxPaise}
          />
          <AmountField
            name="incomeTax"
            label="Income tax (₹)"
            defaultPaise={entry?.incomeTaxPaise}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <AmountField
          name="net"
          label="Net pay (₹)"
          defaultPaise={entry?.netPaise}
          required
        />
        <div className="flex flex-col gap-2">
          <Label>Credited account</Label>
          <Select
            name="creditedAccountId"
            defaultValue={entry?.creditedAccountId ?? "none"}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!entry ? (
        <>
          <div className="flex items-center gap-3">
            <Checkbox id="createTransaction" name="createTransaction" defaultChecked />
            <Label htmlFor="createTransaction" className="font-normal">
              Also record an income transaction in the credited account
            </Label>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="creditedDate">Credited on</Label>
            <Input
              key={month}
              id="creditedDate"
              name="creditedDate"
              type="date"
              defaultValue={`${month}-01`}
            />
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={entry?.notes ?? ""} rows={2} />
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : entry ? "Save changes" : "Add entry"}
      </Button>
    </form>
  );
}
