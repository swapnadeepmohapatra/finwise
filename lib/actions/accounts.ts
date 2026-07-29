"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { accounts, balanceSnapshots } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/guard";
import { parseINRToPaise } from "@/lib/utils/money";
import { todayIST } from "@/lib/utils/dates";

export type ActionState = { error?: string; success?: boolean };

const accountSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  type: z.enum(["bank", "credit_card", "demat", "cash", "wallet"]),
  institution: z.string().trim().optional(),
  last4: z.string().trim().max(8).optional(),
  balance: z.string().trim().optional(),
  creditLimit: z.string().trim().optional(),
  billDueDay: z.coerce.number().int().min(1).max(31).optional(),
  notes: z.string().trim().optional(),
});

function parseOptionalAmount(
  value: string | undefined,
  label: string,
): { paise: number | null } | { error: string } {
  if (!value) return { paise: null };
  const paise = parseINRToPaise(value);
  if (paise === null) return { error: `Invalid ${label}` };
  return { paise };
}

function formValues(formData: FormData) {
  return accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    institution: formData.get("institution") || undefined,
    last4: formData.get("last4") || undefined,
    balance: formData.get("balance") || undefined,
    creditLimit: formData.get("creditLimit") || undefined,
    billDueDay: formData.get("billDueDay") || undefined,
    notes: formData.get("notes") || undefined,
  });
}

export async function createAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const parsed = formValues(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;

  const balance = parseOptionalAmount(v.balance, "balance");
  if ("error" in balance) return { error: balance.error };
  const creditLimit = parseOptionalAmount(v.creditLimit, "credit limit");
  if ("error" in creditLimit) return { error: creditLimit.error };

  const db = getDb();
  const [account] = await db
    .insert(accounts)
    .values({
      name: v.name,
      type: v.type,
      institution: v.institution,
      last4: v.last4,
      currentBalancePaise: balance.paise,
      creditLimitPaise: creditLimit.paise,
      billDueDay: v.billDueDay,
      notes: v.notes,
    })
    .returning();

  if (balance.paise !== null) {
    await db
      .insert(balanceSnapshots)
      .values({ accountId: account.id, balancePaise: balance.paise, asOf: todayIST() })
      .onConflictDoNothing();
  }

  revalidatePath("/accounts");
  revalidatePath("/credit-cards");
  revalidatePath("/");
  return { success: true };
}

export async function updateAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing account id" };
  const parsed = formValues(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;

  const creditLimit = parseOptionalAmount(v.creditLimit, "credit limit");
  if ("error" in creditLimit) return { error: creditLimit.error };

  await getDb()
    .update(accounts)
    .set({
      name: v.name,
      type: v.type,
      institution: v.institution ?? null,
      last4: v.last4 ?? null,
      creditLimitPaise: creditLimit.paise,
      billDueDay: v.billDueDay ?? null,
      notes: v.notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, id));

  revalidatePath("/accounts");
  revalidatePath("/credit-cards");
  return { success: true };
}

export async function updateBalance(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  const balanceRaw = formData.get("balance");
  if (typeof id !== "string" || !id) return { error: "Missing account id" };
  if (typeof balanceRaw !== "string") return { error: "Balance is required" };
  const paise = parseINRToPaise(balanceRaw);
  if (paise === null) return { error: "Invalid balance amount" };

  const db = getDb();
  const asOf = todayIST();
  await db
    .update(accounts)
    .set({ currentBalancePaise: paise, updatedAt: new Date() })
    .where(eq(accounts.id, id));
  await db
    .insert(balanceSnapshots)
    .values({ accountId: id, balancePaise: paise, asOf })
    .onConflictDoUpdate({
      target: [balanceSnapshots.accountId, balanceSnapshots.asOf],
      set: { balancePaise: paise },
    });

  revalidatePath("/accounts");
  revalidatePath("/");
  return { success: true };
}

export async function setAccountActive(id: string, isActive: boolean) {
  await requireSession();
  await getDb()
    .update(accounts)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(accounts.id, id));
  revalidatePath("/accounts");
  revalidatePath("/credit-cards");
}

export async function deleteAccount(id: string) {
  await requireSession();
  await getDb().delete(accounts).where(eq(accounts.id, id));
  revalidatePath("/accounts");
  revalidatePath("/credit-cards");
  revalidatePath("/transactions");
  revalidatePath("/");
}
