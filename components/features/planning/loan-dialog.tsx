"use client";

import { useState } from "react";
import type { Loan } from "@/lib/db/schema";
import { LoanFormInner } from "./loan-form-inner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function LoanDialog({
  loan,
  trigger,
}: {
  loan?: Loan;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{loan ? "Edit loan" : "Add loan"}</DialogTitle>
        </DialogHeader>
        <LoanFormInner loan={loan} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
