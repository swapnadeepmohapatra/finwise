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

export function AccountDialog({
  account,
  trigger,
}: {
  account?: Account;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "Add account"}</DialogTitle>
        </DialogHeader>
        <AccountFormInner account={account} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
