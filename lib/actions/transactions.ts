"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { dedupeHash } from "@/lib/db/dedupe";
import { requireSession } from "@/lib/auth/guard";
import { parseINRToPaise } from "@/lib/utils/money";
import type { ActionState } from "./accounts";

const txnSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  accountId: z.string().uuid("Account is required"),
  amount: z.string().trim().min(1, "Amount is required"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  description: z.string().trim().min(1, "Description is required"),
  merchant: z.string().trim().optional(),
  categoryId: z.string().uuid().optional(),
  counterAccountId: z.string().uuid().optional(),
  notes: z.string().trim().optional(),
});

/** Radix Select posts "none" for the empty option — treat it as unset. */
function optional(formData: FormData, key: string) {
  const value = formData.get(key);
  return value && value !== "none" ? value : undefined;
}

function parseTxn(formData: FormData) {
  const parsed = txnSchema.safeParse({
    type: formData.get("type"),
    accountId: formData.get("accountId"),
    amount: formData.get("amount"),
    date: formData.get("date"),
    description: formData.get("description"),
    merchant: optional(formData, "merchant"),
    categoryId: optional(formData, "categoryId"),
    counterAccountId: optional(formData, "counterAccountId"),
    notes: optional(formData, "notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const v = parsed.data;

  const amountPaise = parseINRToPaise(v.amount);
  if (amountPaise === null || amountPaise <= 0)
    return { error: "Invalid amount" } as const;
  if (v.type === "transfer" && !v.counterAccountId)
    return { error: "Transfer needs a destination account" } as const;
  if (v.type === "transfer" && v.counterAccountId === v.accountId)
    return { error: "Transfer accounts must differ" } as const;

  return {
    values: {
      type: v.type,
      accountId: v.accountId,
      amountPaise,
      date: v.date,
      description: v.description,
      merchant: v.merchant ?? null,
      categoryId: v.type === "transfer" ? null : (v.categoryId ?? null),
      counterAccountId: v.type === "transfer" ? (v.counterAccountId ?? null) : null,
      notes: v.notes ?? null,
      dedupeHash: dedupeHash(v.accountId, v.date, amountPaise, v.description),
    },
  } as const;
}

function revalidateTxnPages() {
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function createTransaction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const result = parseTxn(formData);
  if ("error" in result) return { error: result.error };
  await getDb().insert(transactions).values(result.values);
  revalidateTxnPages();
  return { success: true };
}

export async function updateTransaction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing transaction id" };
  const result = parseTxn(formData);
  if ("error" in result) return { error: result.error };
  await getDb()
    .update(transactions)
    .set(result.values)
    .where(eq(transactions.id, id));
  revalidateTxnPages();
  return { success: true };
}

export async function deleteTransaction(id: string) {
  await requireSession();
  await getDb().delete(transactions).where(eq(transactions.id, id));
  revalidateTxnPages();
}
