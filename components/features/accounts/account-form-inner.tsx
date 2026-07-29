"use client";

import { useState } from "react";
import type { Account } from "@/lib/db/schema";
import { createAccount, updateAccount } from "@/lib/actions/accounts";
import { useActionForm } from "@/components/features/use-action-form";
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

const ACCOUNT_TYPES = [
  { value: "bank", label: "Bank account" },
  { value: "credit_card", label: "Credit card" },
  { value: "demat", label: "Demat" },
  { value: "cash", label: "Cash" },
  { value: "wallet", label: "Wallet" },
] as const;

export function AccountFormInner({
  account,
  defaultType,
  onDone,
}: {
  account?: Account;
  defaultType?: Account["type"];
  onDone: () => void;
}) {
  const [type, setType] = useState<string>(account?.type ?? defaultType ?? "bank");
  const { state, formAction, pending } = useActionForm(
    account ? updateAccount : createAccount,
    {
      onSuccess: onDone,
      successMessage: account ? "Account updated" : "Account added",
    },
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {account ? <input type="hidden" name="id" value={account.id} /> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={account?.name}
          placeholder="HDFC Salary Account"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Type</Label>
          <Select name="type" value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="last4">Last 4 digits</Label>
          <Input id="last4" name="last4" defaultValue={account?.last4 ?? ""} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="institution">Institution</Label>
        <Input
          id="institution"
          name="institution"
          defaultValue={account?.institution ?? ""}
          placeholder="HDFC Bank"
        />
      </div>
      {type === "credit_card" ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="creditLimit">Credit limit (₹)</Label>
            <Input
              id="creditLimit"
              name="creditLimit"
              inputMode="decimal"
              defaultValue={
                account?.creditLimitPaise != null
                  ? (account.creditLimitPaise / 100).toString()
                  : ""
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="billDueDay">Bill due day</Label>
            <Input
              id="billDueDay"
              name="billDueDay"
              type="number"
              min={1}
              max={31}
              defaultValue={account?.billDueDay ?? ""}
            />
          </div>
        </div>
      ) : null}
      {!account && type !== "credit_card" && type !== "demat" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="balance">Current balance (₹)</Label>
          <Input id="balance" name="balance" inputMode="decimal" placeholder="0.00" />
        </div>
      ) : null}
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : account ? "Save changes" : "Add account"}
      </Button>
    </form>
  );
}
