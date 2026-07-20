"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/guard";
import type { ActionState } from "./accounts";

const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  kind: z.enum(["income", "expense"]),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Invalid color")
    .optional(),
});

export async function createCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    color: formData.get("color") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await getDb().insert(categories).values(parsed.data);
  } catch {
    return { error: "A category with that name already exists" };
  }
  revalidatePath("/settings");
  revalidatePath("/transactions");
  return { success: true };
}

export async function updateCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing category id" };
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    color: formData.get("color") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await getDb().update(categories).set(parsed.data).where(eq(categories.id, id));
  } catch {
    return { error: "A category with that name already exists" };
  }
  revalidatePath("/settings");
  revalidatePath("/transactions");
  return { success: true };
}

export async function deleteCategory(id: string) {
  await requireSession();
  await getDb().delete(categories).where(eq(categories.id, id));
  revalidatePath("/settings");
  revalidatePath("/transactions");
}
