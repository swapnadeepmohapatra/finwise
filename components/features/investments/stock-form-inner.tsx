"use client";

import type { StockHolding } from "@/lib/db/schema";
import { createStockHolding, updateStockHolding } from "@/lib/actions/holdings";
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

export type DematAccountOption = { id: string; name: string };

export function StockFormInner({
  holding,
  dematAccounts,
  onDone,
}: {
  holding?: StockHolding;
  dematAccounts: DematAccountOption[];
  onDone: () => void;
}) {
  const { state, formAction, pending } = useActionForm(
    holding ? updateStockHolding : createStockHolding,
    {
      onSuccess: onDone,
      successMessage: holding ? "Holding updated" : "Holding added",
    },
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {holding ? <input type="hidden" name="id" value={holding.id} /> : null}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ticker">Ticker</Label>
          <Input
            id="ticker"
            name="ticker"
            defaultValue={holding?.ticker}
            placeholder="RELIANCE"
            className="uppercase"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Exchange</Label>
          <Select name="exchange" defaultValue={holding?.exchange ?? "NSE"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NSE">NSE</SelectItem>
              <SelectItem value="BSE">BSE</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="companyName">Company name</Label>
        <Input
          id="companyName"
          name="companyName"
          defaultValue={holding?.companyName ?? ""}
          placeholder="Reliance Industries Ltd"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Demat account</Label>
        <Select
          name="dematAccountId"
          defaultValue={holding?.dematAccountId ?? "none"}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {dematAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity"
            name="quantity"
            inputMode="decimal"
            defaultValue={holding?.quantity ?? ""}
            placeholder="10"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="avgPrice">Avg price (₹/share)</Label>
          <Input
            id="avgPrice"
            name="avgPrice"
            inputMode="decimal"
            defaultValue={
              holding ? (holding.avgPricePaise / 100).toString() : ""
            }
            placeholder="2450.50"
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="invested">Invested (₹)</Label>
          <Input
            id="invested"
            name="invested"
            inputMode="decimal"
            defaultValue={holding ? (holding.investedPaise / 100).toString() : ""}
            placeholder="Auto: qty × avg price"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="currentPrice">Current price (₹)</Label>
          <Input
            id="currentPrice"
            name="currentPrice"
            inputMode="decimal"
            defaultValue={
              holding?.currentPricePaise != null
                ? (holding.currentPricePaise / 100).toString()
                : ""
            }
          />
        </div>
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
