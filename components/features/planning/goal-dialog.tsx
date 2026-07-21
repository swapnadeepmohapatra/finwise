"use client";

import { useState } from "react";
import { createGoal, updateGoal } from "@/lib/actions/goals";
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
import { Textarea } from "@/components/ui/textarea";

/** Serializable goal fields the client dialogs need. */
export type GoalData = {
  id: string;
  name: string;
  targetPaise: number;
  savedPaise: number;
  targetDate: string | null;
  notes: string | null;
};

function paiseToInputValue(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

export function GoalDialog({
  goal,
  trigger,
}: {
  goal?: GoalData;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{goal ? "Edit goal" : "New goal"}</DialogTitle>
        </DialogHeader>
        {open ? <GoalForm goal={goal} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

export function GoalForm({ goal, onDone }: { goal?: GoalData; onDone: () => void }) {
  const { state, formAction, pending } = useActionForm(
    goal ? updateGoal : createGoal,
    {
      onSuccess: onDone,
      successMessage: goal ? "Goal updated" : "Goal created",
    },
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {goal ? <input type="hidden" name="id" value={goal.id} /> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          placeholder="Emergency fund"
          defaultValue={goal?.name}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="target">Target (₹)</Label>
          <Input
            id="target"
            name="target"
            inputMode="decimal"
            placeholder="5,00,000"
            defaultValue={goal ? paiseToInputValue(goal.targetPaise) : undefined}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="saved">Saved so far (₹)</Label>
          <Input
            id="saved"
            name="saved"
            inputMode="decimal"
            placeholder="0"
            defaultValue={goal ? paiseToInputValue(goal.savedPaise) : undefined}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="targetDate">Target date (optional)</Label>
        <Input
          id="targetDate"
          name="targetDate"
          type="date"
          defaultValue={goal?.targetDate ?? undefined}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={goal?.notes ?? undefined}
        />
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : goal ? "Save changes" : "Create goal"}
      </Button>
    </form>
  );
}
