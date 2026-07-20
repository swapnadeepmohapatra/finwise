"use client";

import type { MfHolding, StockHolding } from "@/lib/db/schema";
import { updateMfNav, updateStockPrice } from "@/lib/actions/holdings";
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

/** Controlled dialog to refresh an MF holding's NAV (recomputes current value). */
export function NavUpdateDialog({
  holding,
  open,
  onOpenChange,
}: {
  holding: MfHolding;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Update NAV</DialogTitle>
        </DialogHeader>
        {open ? (
          <NavForm holding={holding} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function NavForm({ holding, onDone }: { holding: MfHolding; onDone: () => void }) {
  const { state, formAction, pending } = useActionForm(updateMfNav, {
    onSuccess: onDone,
    successMessage: "NAV updated",
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={holding.id} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="currentNav">Current NAV</Label>
        <Input
          id="currentNav"
          name="currentNav"
          inputMode="decimal"
          defaultValue={holding.currentNav ?? ""}
          autoFocus
          required
        />
        <p className="text-xs text-muted-foreground">
          {Number(holding.units).toLocaleString("en-IN", {
            maximumFractionDigits: 4,
          })}{" "}
          units — current value recomputes automatically.
        </p>
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Update NAV"}
      </Button>
    </form>
  );
}

/** Controlled dialog to refresh a stock holding's price (recomputes current value). */
export function PriceUpdateDialog({
  holding,
  open,
  onOpenChange,
}: {
  holding: StockHolding;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Update price</DialogTitle>
        </DialogHeader>
        {open ? (
          <PriceForm holding={holding} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PriceForm({
  holding,
  onDone,
}: {
  holding: StockHolding;
  onDone: () => void;
}) {
  const { state, formAction, pending } = useActionForm(updateStockPrice, {
    onSuccess: onDone,
    successMessage: "Price updated",
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={holding.id} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="currentPrice">Current price (₹/share)</Label>
        <Input
          id="currentPrice"
          name="currentPrice"
          inputMode="decimal"
          defaultValue={
            holding.currentPricePaise != null
              ? (holding.currentPricePaise / 100).toString()
              : ""
          }
          autoFocus
          required
        />
        <p className="text-xs text-muted-foreground">
          {Number(holding.quantity).toLocaleString("en-IN", {
            maximumFractionDigits: 2,
          })}{" "}
          shares — current value recomputes automatically.
        </p>
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Update price"}
      </Button>
    </form>
  );
}
