"use client";

import { useState } from "react";
import type { Account } from "@/lib/db/schema";
import { AccountFormInner } from "./account-form-inner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ADD_TITLES: Partial<Record<Account["type"], string>> = {
  bank: "Add bank account",
  credit_card: "Add credit card",
};

export function AccountDialog({
  account,
  defaultType,
  trigger,
}: {
  account?: Account;
  defaultType?: Account["type"];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {account
              ? "Edit account"
              : ((defaultType && ADD_TITLES[defaultType]) ?? "Add account")}
          </DialogTitle>
        </DialogHeader>
        <AccountFormInner
          account={account}
          defaultType={defaultType}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
