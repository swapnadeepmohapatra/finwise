"use client";

import { useState } from "react";
import type { StockHolding } from "@/lib/db/schema";
import { StockFormInner, type DematAccountOption } from "./stock-form-inner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function StockDialog({
  holding,
  dematAccounts,
  trigger,
}: {
  holding?: StockHolding;
  dematAccounts: DematAccountOption[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{holding ? "Edit holding" : "Add stock holding"}</DialogTitle>
        </DialogHeader>
        {open ? (
          <StockFormInner
            holding={holding}
            dematAccounts={dematAccounts}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
