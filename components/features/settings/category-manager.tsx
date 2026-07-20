"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Category } from "@/lib/db/schema";
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/lib/actions/categories";
import { useActionForm } from "@/components/features/use-action-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

export function CategoryManager({ categories }: { categories: Category[] }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | undefined>();
  const [deleting, setDeleting] = useState<Category | undefined>();

  const openCreate = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };
  const openEdit = (c: Category) => {
    setEditing(c);
    setDialogOpen(true);
  };

  const groups: { kind: "expense" | "income"; title: string }[] = [
    { kind: "expense", title: "Expense categories" },
    { kind: "income", title: "Income categories" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add category
        </Button>
      </div>
      {groups.map(({ kind, title }) => (
        <section key={kind} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
          <div className="flex flex-wrap gap-2">
            {categories
              .filter((c) => c.kind === kind)
              .map((c) => (
                <div
                  key={c.id}
                  className="group flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: c.color ?? "#9ca3af" }}
                  />
                  {c.name}
                  <button
                    type="button"
                    className="text-muted-foreground opacity-60 transition-opacity hover:opacity-100"
                    onClick={() => openEdit(c)}
                    aria-label={`Edit ${c.name}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground opacity-60 transition-opacity hover:text-destructive hover:opacity-100"
                    onClick={() => setDeleting(c)}
                    aria-label={`Delete ${c.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
          </div>
        </section>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit category" : "Add category"}</DialogTitle>
          </DialogHeader>
          {dialogOpen ? (
            <CategoryForm category={editing} onDone={() => setDialogOpen(false)} />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Transactions using it will become uncategorised.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleting) return;
                await deleteCategory(deleting.id);
                setDeleting(undefined);
                toast.success("Category deleted");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CategoryForm({
  category,
  onDone,
}: {
  category?: Category;
  onDone: () => void;
}) {
  const { state, formAction, pending } = useActionForm(
    category ? updateCategory : createCategory,
    {
      onSuccess: onDone,
      successMessage: category ? "Category updated" : "Category added",
    },
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={category?.name} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Kind</Label>
          <Select name="kind" defaultValue={category?.kind ?? "expense"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="income">Income</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="color">Color</Label>
          <Input
            id="color"
            name="color"
            type="color"
            defaultValue={category?.color ?? "#22c55e"}
            className="h-9 p-1"
          />
        </div>
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : category ? "Save changes" : "Add category"}
      </Button>
    </form>
  );
}
