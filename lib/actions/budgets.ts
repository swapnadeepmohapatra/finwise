"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { budgets } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/guard";
import { parseINRToPaise } from "@/lib/utils/money";
import type { ActionState } from "./accounts";

const budgetSchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  monthlyLimit: z.string().trim().min(1, "Monthly limit is required"),
});

/** Create or update the budget for a category (one budget per category). */
export async function setBudget(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const parsed = budgetSchema.safeParse({
    categoryId: formData.get("categoryId"),
    monthlyLimit: formData.get("monthlyLimit"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  // Radix Select posts "none" for the empty option — a budget needs a category.
  if (v.categoryId === "none") return { error: "Category is required" };

  const paise = parseINRToPaise(v.monthlyLimit);
  if (paise === null || paise <= 0) return { error: "Invalid monthly limit" };

  await getDb()
    .insert(budgets)
    .values({ categoryId: v.categoryId, monthlyLimitPaise: paise })
    .onConflictDoUpdate({
      target: budgets.categoryId,
      set: { monthlyLimitPaise: paise },
    });

  revalidatePath("/planning/budgets");
  revalidatePath("/");
  return { success: true };
}

export async function deleteBudget(id: string) {
  await requireSession();
  await getDb().delete(budgets).where(eq(budgets.id, id));
  revalidatePath("/planning/budgets");
  revalidatePath("/");
}
