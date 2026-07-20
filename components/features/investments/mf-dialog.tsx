"use client";

import { useState } from "react";
import type { MfHolding } from "@/lib/db/schema";
import { MfFormInner } from "./mf-form-inner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function MfDialog({
  holding,
  trigger,
}: {
  holding?: MfHolding;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{holding ? "Edit holding" : "Add MF holding"}</DialogTitle>
        </DialogHeader>
        {open ? <MfFormInner holding={holding} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
