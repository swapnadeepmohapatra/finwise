"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoreVertical } from "lucide-react";
import type { Account } from "@/lib/db/schema";
import {
  deleteAccount,
  setAccountActive,
  updateBalance,
} from "@/lib/actions/accounts";
import { useActionForm } from "@/components/features/use-action-form";
import { AccountFormInner } from "./account-form-inner";
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

export function AccountMenu({ account }: { account: Account }) {
  const [editOpen, setEditOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const canUpdateBalance = account.type !== "credit_card" && account.type !== "demat";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">Account actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canUpdateBalance ? (
            <DropdownMenuItem onSelect={() => setBalanceOpen(true)}>
              Update balance
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>Edit</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              await setAccountActive(account.id, !account.isActive);
              toast.success(account.isActive ? "Account deactivated" : "Account activated");
            }}
          >
            {account.isActive ? "Deactivate" : "Activate"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit dialog (controlled, no trigger) */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit account</DialogTitle>
          </DialogHeader>
          {editOpen ? (
            <AccountFormInner account={account} onDone={() => setEditOpen(false)} />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={balanceOpen} onOpenChange={setBalanceOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Update balance</DialogTitle>
          </DialogHeader>
          {balanceOpen ? (
            <BalanceForm account={account} onDone={() => setBalanceOpen(false)} />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {account.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the account and all its transactions. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await deleteAccount(account.id);
                toast.success("Account deleted");
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

function BalanceForm({
  account,
  onDone,
}: {
  account: Account;
  onDone: () => void;
}) {
  const { state, formAction, pending } = useActionForm(updateBalance, {
    onSuccess: onDone,
    successMessage: "Balance updated",
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={account.id} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="balance">Current balance (₹)</Label>
        <Input
          id="balance"
          name="balance"
          inputMode="decimal"
          defaultValue={
            account.currentBalancePaise != null
              ? (account.currentBalancePaise / 100).toString()
              : ""
          }
          autoFocus
          required
        />
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Update balance"}
      </Button>
    </form>
  );
}
