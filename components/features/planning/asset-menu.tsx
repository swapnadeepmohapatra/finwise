"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoreVertical } from "lucide-react";
import type { Asset } from "@/lib/db/schema";
import { deleteAsset, updateAssetValue } from "@/lib/actions/assets";
import { useActionForm } from "@/components/features/use-action-form";
import { AssetFormInner } from "./asset-form-inner";
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

export function AssetMenu({ asset }: { asset: Asset }) {
  const [valueOpen, setValueOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">Asset actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setValueOpen(true)}>
            Update value
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>Edit</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={valueOpen} onOpenChange={setValueOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Update value</DialogTitle>
          </DialogHeader>
          {valueOpen ? (
            <ValueForm asset={asset} onDone={() => setValueOpen(false)} />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Edit dialog (controlled, no trigger) */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit asset</DialogTitle>
          </DialogHeader>
          {editOpen ? (
            <AssetFormInner asset={asset} onDone={() => setEditOpen(false)} />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {asset.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the asset from your net worth. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await deleteAsset(asset.id);
                toast.success("Asset deleted");
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

function ValueForm({ asset, onDone }: { asset: Asset; onDone: () => void }) {
  const { state, formAction, pending } = useActionForm(updateAssetValue, {
    onSuccess: onDone,
    successMessage: "Value updated",
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={asset.id} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="value">Current value (₹)</Label>
        <Input
          id="value"
          name="value"
          inputMode="decimal"
          defaultValue={(asset.valuePaise / 100).toString()}
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
        {pending ? "Saving…" : "Update value"}
      </Button>
    </form>
  );
}
