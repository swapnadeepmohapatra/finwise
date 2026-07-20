"use client";

import type { MfHolding } from "@/lib/db/schema";
import { createMfHolding, updateMfHolding } from "@/lib/actions/holdings";
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

export const HOLDING_KINDS = [
  { value: "equity", label: "Equity" },
  { value: "debt", label: "Debt" },
  { value: "hybrid", label: "Hybrid" },
  { value: "elss", label: "ELSS" },
  { value: "index", label: "Index" },
  { value: "liquid", label: "Liquid" },
  { value: "other", label: "Other" },
] as const;

export function MfFormInner({
  holding,
  onDone,
}: {
  holding?: MfHolding;
  onDone: () => void;
}) {
  const { state, formAction, pending } = useActionForm(
    holding ? updateMfHolding : createMfHolding,
    {
      onSuccess: onDone,
      successMessage: holding ? "Holding updated" : "Holding added",
    },
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {holding ? <input type="hidden" name="id" value={holding.id} /> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="schemeName">Scheme name</Label>
        <Input
          id="schemeName"
          name="schemeName"
          defaultValue={holding?.schemeName}
          placeholder="Parag Parikh Flexi Cap Direct Growth"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="amc">AMC</Label>
          <Input
            id="amc"
            name="amc"
            defaultValue={holding?.amc ?? ""}
            placeholder="PPFAS"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="folioNo">Folio no.</Label>
          <Input id="folioNo" name="folioNo" defaultValue={holding?.folioNo ?? ""} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Kind</Label>
          <Select name="holdingKind" defaultValue={holding?.holdingKind ?? "equity"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOLDING_KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="units">Units</Label>
          <Input
            id="units"
            name="units"
            inputMode="decimal"
            defaultValue={holding?.units ?? ""}
            placeholder="123.4567"
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="avgNav">Avg NAV</Label>
          <Input
            id="avgNav"
            name="avgNav"
            inputMode="decimal"
            defaultValue={holding?.avgNav ?? ""}
            placeholder="45.1234"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invested">Invested (₹)</Label>
          <Input
            id="invested"
            name="invested"
            inputMode="decimal"
            defaultValue={
              holding ? (holding.investedPaise / 100).toString() : ""
            }
            placeholder="50000"
            required
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="currentNav">Current NAV (optional)</Label>
        <Input
          id="currentNav"
          name="currentNav"
          inputMode="decimal"
          defaultValue={holding?.currentNav ?? ""}
          placeholder="52.10"
        />
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : holding ? "Save changes" : "Add holding"}
      </Button>
    </form>
  );
}
