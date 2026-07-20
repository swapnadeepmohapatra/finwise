"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { accounts, creditCardBills, transactions } from "@/lib/db/schema";
import { dedupeHash } from "@/lib/db/dedupe";
import { requireSession } from "@/lib/auth/guard";
import { parseINRToPaise } from "@/lib/utils/money";
import { todayIST } from "@/lib/utils/dates";
import type { ActionState } from "./accounts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const billSchema = z.object({
  accountId: z.string().uuid("Credit card is required"),
  statementDate: z.string().regex(DATE_RE, "Statement date is required"),
  dueDate: z.string().regex(DATE_RE, "Due date is required"),
  periodStart: z.string().regex(DATE_RE, "Invalid period start").optional(),
  periodEnd: z.string().regex(DATE_RE, "Invalid period end").optional(),
  totalDue: z.string().trim().min(1, "Total due is required"),
  minDue: z.string().trim().optional(),
});

/** Radix Select posts "none" for the empty option — treat it as unset. */
function optional(formData: FormData, key: string) {
  const value = formData.get(key);
  return value && value !== "none" ? value : undefined;
}

/** "YYYY-MM-DD" → same day one month earlier (clamped to month length). */
function oneMonthBefore(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const total = y * 12 + (m - 1) - 1;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseBill(formData: FormData) {
  const parsed = billSchema.safeParse({
    accountId: formData.get("accountId"),
    statementDate: formData.get("statementDate"),
    dueDate: formData.get("dueDate"),
    periodStart: optional(formData, "periodStart"),
    periodEnd: optional(formData, "periodEnd"),
    totalDue: formData.get("totalDue"),
    minDue: optional(formData, "minDue"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const v = parsed.data;

  const totalDuePaise = parseINRToPaise(v.totalDue);
  if (totalDuePaise === null || totalDuePaise < 0)
    return { error: "Invalid total due amount" } as const;

  let minDuePaise: number | null = null;
  if (v.minDue) {
    minDuePaise = parseINRToPaise(v.minDue);
    if (minDuePaise === null || minDuePaise < 0)
      return { error: "Invalid minimum due amount" } as const;
  }

  const periodEnd = v.periodEnd ?? v.statementDate;
  const periodStart = v.periodStart ?? oneMonthBefore(periodEnd);

  return {
    values: {
      accountId: v.accountId,
      statementDate: v.statementDate,
      dueDate: v.dueDate,
      periodStart,
      periodEnd,
      totalDuePaise,
      minDuePaise,
    },
  } as const;
}

function revalidateBillPages() {
  revalidatePath("/credit-cards");
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/");
}

export async function createBill(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const result = parseBill(formData);
  if ("error" in result) return { error: result.error };

  const inserted = await getDb()
    .insert(creditCardBills)
    .values(result.values)
    .onConflictDoNothing({
      target: [creditCardBills.accountId, creditCardBills.statementDate],
    })
    .returning({ id: creditCardBills.id });
  if (inserted.length === 0)
    return { error: "A bill for this statement date already exists" };

  revalidateBillPages();
  return { success: true };
}

export async function updateBill(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing bill id" };
  const result = parseBill(formData);
  if ("error" in result) return { error: result.error };

  const db = getDb();
  const clash = await db.query.creditCardBills.findFirst({
    where: and(
      eq(creditCardBills.accountId, result.values.accountId),
      eq(creditCardBills.statementDate, result.values.statementDate),
      ne(creditCardBills.id, id),
    ),
  });
  if (clash) return { error: "A bill for this statement date already exists" };

  await db
    .update(creditCardBills)
    .set(result.values)
    .where(eq(creditCardBills.id, id));

  revalidateBillPages();
  return { success: true };
}

export async function deleteBill(id: string) {
  await requireSession();
  await getDb().delete(creditCardBills).where(eq(creditCardBills.id, id));
  revalidateBillPages();
}

export async function markBillPaid(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing bill id" };

  const paidDateRaw = optional(formData, "paidDate");
  const paidDate =
    typeof paidDateRaw === "string" && DATE_RE.test(paidDateRaw)
      ? paidDateRaw
      : todayIST();

  const fromAccountIdRaw = optional(formData, "fromAccountId");
  const fromAccountId =
    typeof fromAccountIdRaw === "string" ? fromAccountIdRaw : null;

  const db = getDb();
  const bill = await db.query.creditCardBills.findFirst({
    where: eq(creditCardBills.id, id),
    with: { account: true },
  });
  if (!bill) return { error: "Bill not found" };

  const remainingPaise = Math.max(bill.totalDuePaise - bill.paidPaise, 0);
  const amountRaw = optional(formData, "amountPaid");
  let amountPaidPaise = remainingPaise;
  if (typeof amountRaw === "string") {
    const parsed = parseINRToPaise(amountRaw);
    if (parsed === null) return { error: "Invalid amount" };
    amountPaidPaise = parsed;
  }
  if (amountPaidPaise <= 0) return { error: "Payment amount must be positive" };

  const newPaidPaise = bill.paidPaise + amountPaidPaise;
  await db
    .update(creditCardBills)
    .set({
      paidPaise: newPaidPaise,
      status: newPaidPaise >= bill.totalDuePaise ? "paid" : "partially_paid",
      paidDate,
    })
    .where(eq(creditCardBills.id, id));

  if (fromAccountId) {
    if (fromAccountId === bill.accountId)
      return { error: "Pay from a different account than the card" };
    const description = `Credit card bill payment — ${bill.account.name}`;
    await db.insert(transactions).values({
      accountId: fromAccountId,
      counterAccountId: bill.accountId,
      type: "transfer",
      amountPaise: amountPaidPaise,
      date: paidDate,
      description,
      dedupeHash: dedupeHash(fromAccountId, paidDate, amountPaidPaise, description),
    });
    await db
      .update(accounts)
      .set({
        currentBalancePaise: sql`coalesce(${accounts.currentBalancePaise}, 0) - ${amountPaidPaise}`,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, fromAccountId));
  }

  revalidateBillPages();
  return { success: true };
}
