"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { goals } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/guard";
import { parseINRToPaise } from "@/lib/utils/money";
import type { ActionState } from "./accounts";

const goalSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  target: z.string().trim().min(1, "Target amount is required"),
  saved: z.string().trim().optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid target date")
    .optional(),
  notes: z.string().trim().optional(),
});

function parseGoalForm(formData: FormData) {
  return goalSchema.safeParse({
    name: formData.get("name"),
    target: formData.get("target"),
    saved: formData.get("saved") || undefined,
    targetDate: formData.get("targetDate") || undefined,
    notes: formData.get("notes") || undefined,
  });
}

function parseAmounts(v: z.infer<typeof goalSchema>):
  | { targetPaise: number; savedPaise: number | null }
  | { error: string } {
  const targetPaise = parseINRToPaise(v.target);
  if (targetPaise === null || targetPaise <= 0) return { error: "Invalid target amount" };
  if (!v.saved) return { targetPaise, savedPaise: null };
  const savedPaise = parseINRToPaise(v.saved);
  if (savedPaise === null) return { error: "Invalid saved amount" };
  return { targetPaise, savedPaise: Math.max(0, savedPaise) };
}

export async function createGoal(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const parsed = parseGoalForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;

  const amounts = parseAmounts(v);
  if ("error" in amounts) return { error: amounts.error };

  await getDb().insert(goals).values({
    name: v.name,
    targetPaise: amounts.targetPaise,
    savedPaise: amounts.savedPaise ?? 0,
    targetDate: v.targetDate ?? null,
    notes: v.notes ?? null,
  });

  revalidatePath("/planning/goals");
  revalidatePath("/");
  return { success: true };
}

export async function updateGoal(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing goal id" };
  const parsed = parseGoalForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;

  const amounts = parseAmounts(v);
  if ("error" in amounts) return { error: amounts.error };

  await getDb()
    .update(goals)
    .set({
      name: v.name,
      targetPaise: amounts.targetPaise,
      // Left blank in the edit form → keep the current saved amount.
      ...(amounts.savedPaise !== null ? { savedPaise: amounts.savedPaise } : {}),
      targetDate: v.targetDate ?? null,
      notes: v.notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(goals.id, id));

  revalidatePath("/planning/goals");
  revalidatePath("/");
  return { success: true };
}

export async function deleteGoal(id: string) {
  await requireSession();
  await getDb().delete(goals).where(eq(goals.id, id));
  revalidatePath("/planning/goals");
  revalidatePath("/");
}

/** Add money to (or withdraw from, via negative amounts) a goal's saved total. */
export async function addToGoal(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  const amountRaw = formData.get("amount");
  if (typeof id !== "string" || !id) return { error: "Missing goal id" };
  if (typeof amountRaw !== "string" || !amountRaw.trim())
    return { error: "Amount is required" };
  const amountPaise = parseINRToPaise(amountRaw);
  if (amountPaise === null || amountPaise === 0) return { error: "Invalid amount" };

  await getDb()
    .update(goals)
    .set({
      // Withdrawals can never take the saved amount below zero.
      savedPaise: sql`greatest(0, ${goals.savedPaise} + ${amountPaise})`,
      updatedAt: new Date(),
    })
    .where(eq(goals.id, id));

  revalidatePath("/planning/goals");
  revalidatePath("/");
  return { success: true };
}
