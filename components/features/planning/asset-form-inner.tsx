"use client";

import { useState } from "react";
import type { Asset } from "@/lib/db/schema";
import { createAsset, updateAsset } from "@/lib/actions/assets";
import { useActionForm } from "@/components/features/use-action-form";
import { ASSET_KINDS, ASSET_KIND_LABELS } from "./asset-kinds";
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

export function AssetFormInner({
  asset,
  onDone,
}: {
  asset?: Asset;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<string>(asset?.kind ?? "other");
  const { state, formAction, pending } = useActionForm(
    asset ? updateAsset : createAsset,
    {
      onSuccess: onDone,
      successMessage: asset ? "Asset updated" : "Asset added",
    },
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {asset ? <input type="hidden" name="id" value={asset.id} /> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={asset?.name}
          placeholder="EPF — UAN 1234"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Kind</Label>
          <Select name="kind" value={kind} onValueChange={setKind}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {ASSET_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="value">Current value (₹)</Label>
          <Input
            id="value"
            name="value"
            inputMode="decimal"
            defaultValue={asset ? (asset.valuePaise / 100).toString() : ""}
            placeholder="0.00"
            required
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="institution">Institution</Label>
        <Input
          id="institution"
          name="institution"
          defaultValue={asset?.institution ?? ""}
          placeholder="EPFO / HDFC Bank"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="annualRatePct">Interest rate (% p.a.)</Label>
          <Input
            id="annualRatePct"
            name="annualRatePct"
            inputMode="decimal"
            defaultValue={asset?.annualRatePct ?? ""}
            placeholder="8.25"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="maturityDate">Maturity date</Label>
          <Input
            id="maturityDate"
            name="maturityDate"
            type="date"
            defaultValue={asset?.maturityDate ?? ""}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} defaultValue={asset?.notes ?? ""} />
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : asset ? "Save changes" : "Add asset"}
      </Button>
    </form>
  );
}
