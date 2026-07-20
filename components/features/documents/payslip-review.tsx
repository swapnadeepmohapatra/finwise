"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { commitPayslipExtraction } from "@/lib/actions/documents";
import { useActionForm } from "@/components/features/use-action-form";
import type { PayslipExtraction } from "@/lib/ai/extraction/schemas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Field({
  name,
  label,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  defaultValue: number | null | undefined;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        inputMode="decimal"
        defaultValue={defaultValue ?? ""}
        required={required}
      />
    </div>
  );
}

export function PayslipReview({
  documentId,
  fileName,
  data,
}: {
  documentId: string;
  fileName: string;
  data: PayslipExtraction;
}) {
  const router = useRouter();
  const { state, formAction, pending } = useActionForm(commitPayslipExtraction, {
    onSuccess: () => {
      toast.success("Salary entry saved");
      router.push("/income");
      router.refresh();
    },
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="documentId" value={documentId} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review payslip — {fileName}</CardTitle>
          <CardDescription>
            Committing creates (or replaces) the salary entry for this month. All
            amounts in ₹.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="month">Month</Label>
              <Input
                id="month"
                name="month"
                type="month"
                defaultValue={data.payPeriodMonth}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="employer">Employer</Label>
              <Input
                id="employer"
                name="employer"
                defaultValue={data.employer ?? ""}
                required
              />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">Earnings</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field name="gross" label="Gross" defaultValue={data.gross} required />
              <Field name="basic" label="Basic" defaultValue={data.earnings.basic} />
              <Field name="hra" label="HRA" defaultValue={data.earnings.hra} />
              <Field
                name="specialAllowance"
                label="Special allowance"
                defaultValue={data.earnings.specialAllowance}
              />
            </div>
            {data.earnings.others.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Other earnings on slip:{" "}
                {data.earnings.others
                  .map((o) => `${o.label} ₹${o.amount.toLocaleString("en-IN")}`)
                  .join(", ")}
              </p>
            ) : null}
          </div>

          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Deductions
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field name="pf" label="PF (EPF)" defaultValue={data.deductions.pf} />
              <Field
                name="professionalTax"
                label="Professional tax"
                defaultValue={data.deductions.professionalTax}
              />
              <Field
                name="incomeTax"
                label="Income tax (TDS)"
                defaultValue={data.deductions.incomeTax}
              />
            </div>
            {data.deductions.others.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Other deductions on slip:{" "}
                {data.deductions.others
                  .map((o) => `${o.label} ₹${o.amount.toLocaleString("en-IN")}`)
                  .join(", ")}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="net" label="Net pay (take-home)" defaultValue={data.net} required />
          </div>

          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save salary entry"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
