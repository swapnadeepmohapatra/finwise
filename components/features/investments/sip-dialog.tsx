"use client";

import { useState } from "react";
import type { Sip } from "@/lib/db/schema";
import { SipFormInner, type MfHoldingOption } from "./sip-form-inner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SipDialog({
  sip,
  mfOptions,
  trigger,
}: {
  sip?: Sip;
  mfOptions: MfHoldingOption[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{sip ? "Edit SIP" : "Add SIP"}</DialogTitle>
        </DialogHeader>
        {open ? (
          <SipFormInner sip={sip} mfOptions={mfOptions} onDone={() => setOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
