"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoreVertical, Plus } from "lucide-react";
import { addToGoal, deleteGoal } from "@/lib/actions/goals";
import { useActionForm } from "@/components/features/use-action-form";
import { GoalForm, type GoalData } from "./goal-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function GoalMenu({ goal }: { goal: GoalData }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">Goal actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>Edit</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit goal</DialogTitle>
          </DialogHeader>
          {editOpen ? <GoalForm goal={goal} onDone={() => setEditOpen(false)} /> : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{goal.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the goal and its saved progress. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await deleteGoal(goal.id);
                toast.success("Goal deleted");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function AddMoneyDialog({ goal }: { goal: GoalData }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Plus className="h-4 w-4" /> Add money
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add money to {goal.name}</DialogTitle>
        </DialogHeader>
        {open ? <AddMoneyForm goalId={goal.id} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AddMoneyForm({ goalId, onDone }: { goalId: string; onDone: () => void }) {
  const { state, formAction, pending } = useActionForm(addToGoal, {
    onSuccess: onDone,
    successMessage: "Goal updated",
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={goalId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="amount">Amount (₹)</Label>
        <Input
          id="amount"
          name="amount"
          inputMode="decimal"
          placeholder="5,000"
          autoFocus
          required
        />
        <p className="text-xs text-muted-foreground">
          Use a negative amount to withdraw.
        </p>
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add"}
      </Button>
    </form>
  );
}
