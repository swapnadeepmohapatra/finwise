"use client";

import { useState } from "react";
import { setBudget } from "@/lib/actions/budgets";
import { useActionForm } from "@/components/features/use-action-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type BudgetCategoryOption = {
  id: string;
  name: string;
  color: string | null;
};

export type BudgetFormData = {
  categoryId: string;
  categoryName: string;
  monthlyLimitPaise: number;
};

function paiseToInputValue(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

/** "Set budget" dialog for categories that don't have a budget yet. */
export function SetBudgetDialog({
  availableCategories,
  trigger,
}: {
  availableCategories: BudgetCategoryOption[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Set budget</DialogTitle>
        </DialogHeader>
        {open ? (
          availableCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every expense category already has a budget. Edit one from the list
              instead.
            </p>
          ) : (
            <BudgetForm
              availableCategories={availableCategories}
              onDone={() => setOpen(false)}
            />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function BudgetForm({
  availableCategories,
  budget,
  onDone,
}: {
  /** Create mode: expense categories without a budget yet. */
  availableCategories?: BudgetCategoryOption[];
  /** Edit mode: the existing budget (category is fixed). */
  budget?: BudgetFormData;
  onDone: () => void;
}) {
  const { state, formAction, pending } = useActionForm(setBudget, {
    onSuccess: onDone,
    successMessage: budget ? "Budget updated" : "Budget set",
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {budget ? (
        <>
          <input type="hidden" name="categoryId" value={budget.categoryId} />
          <div className="flex flex-col gap-2">
            <Label>Category</Label>
            <p className="text-sm text-muted-foreground">{budget.categoryName}</p>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <Label>Category</Label>
          <Select name="categoryId" defaultValue={availableCategories?.[0]?.id}>
            <SelectTrigger>
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {availableCategories?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: c.color ?? "#9ca3af" }}
                    />
                    {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="monthlyLimit">Monthly limit (₹)</Label>
        <Input
          id="monthlyLimit"
          name="monthlyLimit"
          inputMode="decimal"
          placeholder="12,000"
          defaultValue={budget ? paiseToInputValue(budget.monthlyLimitPaise) : undefined}
          required
        />
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : budget ? "Save changes" : "Set budget"}
      </Button>
    </form>
  );
}
