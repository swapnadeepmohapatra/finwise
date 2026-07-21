"use client";

import type { Loan } from "@/lib/db/schema";
import { createLoan, updateLoan } from "@/lib/actions/loans";
import { useActionForm } from "@/components/features/use-action-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function LoanFormInner({
  loan,
  onDone,
}: {
  loan?: Loan;
  onDone: () => void;
}) {
  const { state, formAction, pending } = useActionForm(
    loan ? updateLoan : createLoan,
    {
      onSuccess: onDone,
      successMessage: loan ? "Loan updated" : "Loan added",
    },
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {loan ? <input type="hidden" name="id" value={loan.id} /> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={loan?.name}
          placeholder="Home loan"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="lender">Lender</Label>
        <Input
          id="lender"
          name="lender"
          defaultValue={loan?.lender ?? ""}
          placeholder="HDFC Bank"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="principal">Principal (₹)</Label>
          <Input
            id="principal"
            name="principal"
            inputMode="decimal"
            defaultValue={loan ? (loan.principalPaise / 100).toString() : ""}
            placeholder="2500000"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="emi">EMI (₹)</Label>
          <Input
            id="emi"
            name="emi"
            inputMode="decimal"
            defaultValue={loan ? (loan.emiPaise / 100).toString() : ""}
            placeholder="21500"
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="annualRatePct">Interest rate (% p.a.)</Label>
          <Input
            id="annualRatePct"
            name="annualRatePct"
            inputMode="decimal"
            defaultValue={loan?.annualRatePct ?? ""}
            placeholder="8.70"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="tenureMonths">Tenure (months)</Label>
          <Input
            id="tenureMonths"
            name="tenureMonths"
            type="number"
            min={1}
            max={600}
            defaultValue={loan?.tenureMonths ?? ""}
            placeholder="240"
            required
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="startDate">First EMI date</Label>
        <Input
          id="startDate"
          name="startDate"
          type="date"
          defaultValue={loan?.startDate ?? ""}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} defaultValue={loan?.notes ?? ""} />
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : loan ? "Save changes" : "Add loan"}
      </Button>
    </form>
  );
}
