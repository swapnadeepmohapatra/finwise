"use client";

import { useState } from "react";
import type { Asset } from "@/lib/db/schema";
import { AssetFormInner } from "./asset-form-inner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AssetDialog({
  asset,
  trigger,
}: {
  asset?: Asset;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{asset ? "Edit asset" : "Add asset"}</DialogTitle>
        </DialogHeader>
        <AssetFormInner asset={asset} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
