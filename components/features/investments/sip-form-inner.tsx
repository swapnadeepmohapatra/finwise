"use client";

import type { Sip } from "@/lib/db/schema";
import { createSip, updateSip } from "@/lib/actions/sips";
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
import { Textarea } from "@/components/ui/textarea";

export type MfHoldingOption = { id: string; schemeName: string };

const ASSET_KINDS = [
  { value: "mutual_fund", label: "Mutual fund" },
  { value: "stock", label: "Stock" },
  { value: "other", label: "Other" },
] as const;

const FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "quarterly", label: "Quarterly" },
] as const;

export function SipFormInner({
  sip,
  mfOptions,
  onDone,
}: {
  sip?: Sip;
  mfOptions: MfHoldingOption[];
  onDone: () => void;
}) {
  const { state, formAction, pending } = useActionForm(sip ? updateSip : createSip, {
    onSuccess: onDone,
    successMessage: sip ? "SIP updated" : "SIP added",
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {sip ? <input type="hidden" name="id" value={sip.id} /> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={sip?.name}
          placeholder="PPFAS Flexi Cap SIP"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="schemeName">Scheme name</Label>
        <Input
          id="schemeName"
          name="schemeName"
          defaultValue={sip?.schemeName ?? ""}
          placeholder="Parag Parikh Flexi Cap Direct Growth"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Asset kind</Label>
          <Select name="assetKind" defaultValue={sip?.assetKind ?? "mutual_fund"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="amount">Amount (₹)</Label>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            defaultValue={sip ? (sip.amountPaise / 100).toString() : ""}
            placeholder="5000"
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Frequency</Label>
          <Select name="frequency" defaultValue={sip?.frequency ?? "monthly"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="dayOfMonth">Day of month (1-28)</Label>
          <Input
            id="dayOfMonth"
            name="dayOfMonth"
            type="number"
            min={1}
            max={28}
            defaultValue={sip?.dayOfMonth ?? ""}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="startDate">Start date</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={sip?.startDate}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="endDate">End date (optional)</Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={sip?.endDate ?? ""}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label>Linked MF holding</Label>
        <Select name="mfHoldingId" defaultValue={sip?.mfHoldingId ?? "none"}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {mfOptions.map((h) => (
              <SelectItem key={h.id} value={h.id}>
                {h.schemeName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Paid installments with units roll into the linked holding.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={sip?.notes ?? ""} rows={2} />
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : sip ? "Save changes" : "Add SIP"}
      </Button>
    </form>
  );
}
