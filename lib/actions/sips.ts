"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  categories,
  mfHoldings,
  sipInstallments,
  sips,
  transactions,
} from "@/lib/db/schema";
import { dedupeHash } from "@/lib/db/dedupe";
import { generateInstallmentsCore } from "@/lib/finance/installments";
import { requireSession } from "@/lib/auth/guard";
import { parseINRToPaise } from "@/lib/utils/money";
import { addMonths, monthStart } from "@/lib/utils/dates";
import type { ActionState } from "./accounts";

const decimalString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "Invalid number");

/** Radix Select posts "none" for the empty option — treat it as unset. */
function optional(formData: FormData, key: string) {
  const value = formData.get(key);
  return value && value !== "none" ? value : undefined;
}

function revalidateSipPages() {
  revalidatePath("/investments/sips");
  revalidatePath("/investments/mutual-funds");
  revalidatePath("/investments");
  revalidatePath("/transactions");
  revalidatePath("/");
}

// ── SIP CRUD ───────────────────────────────────────────────────────────────

const sipSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  schemeName: z.string().trim().optional(),
  assetKind: z.enum(["mutual_fund", "stock", "other"]),
  amount: z.string().trim().min(1, "Amount is required"),
  frequency: z.enum(["monthly", "weekly", "quarterly"]),
  dayOfMonth: z.coerce.number().int().min(1, "Day must be 1-28").max(28, "Day must be 1-28"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date is required"),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid end date")
    .optional(),
  mfHoldingId: z.string().uuid().optional(),
  notes: z.string().trim().optional(),
});

function parseSip(formData: FormData) {
  const parsed = sipSchema.safeParse({
    name: formData.get("name"),
    schemeName: formData.get("schemeName") || undefined,
    assetKind: formData.get("assetKind"),
    amount: formData.get("amount"),
    frequency: formData.get("frequency"),
    dayOfMonth: formData.get("dayOfMonth"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") || undefined,
    mfHoldingId: optional(formData, "mfHoldingId"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const v = parsed.data;

  const amountPaise = parseINRToPaise(v.amount);
  if (amountPaise === null || amountPaise <= 0)
    return { error: "Invalid amount" } as const;
  if (v.endDate && v.endDate < v.startDate)
    return { error: "End date must be after start date" } as const;

  return {
    values: {
      name: v.name,
      schemeName: v.schemeName ?? null,
      assetKind: v.assetKind,
      amountPaise,
      frequency: v.frequency,
      dayOfMonth: v.dayOfMonth,
      startDate: v.startDate,
      endDate: v.endDate ?? null,
      mfHoldingId: v.mfHoldingId ?? null,
      notes: v.notes ?? null,
    },
  } as const;
}

export async function createSip(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const result = parseSip(formData);
  if ("error" in result) return { error: result.error };
  await getDb().insert(sips).values(result.values);
  revalidateSipPages();
  return { success: true };
}

export async function updateSip(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing SIP id" };
  const result = parseSip(formData);
  if ("error" in result) return { error: result.error };
  await getDb().update(sips).set(result.values).where(eq(sips.id, id));
  revalidateSipPages();
  return { success: true };
}

export async function deleteSip(id: string) {
  await requireSession();
  await getDb().delete(sips).where(eq(sips.id, id));
  revalidateSipPages();
}

export async function toggleSipActive(id: string, isActive: boolean) {
  await requireSession();
  await getDb().update(sips).set({ isActive }).where(eq(sips.id, id));
  revalidateSipPages();
}

// ── Installments ───────────────────────────────────────────────────────────

/** Whole months between two "YYYY-MM-01" month starts (b - a). */
function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by * 12 + bm) - (ay * 12 + am);
}

/**
 * Inserts "upcoming" installments for every active SIP for the current and
 * next month (IST) at its dayOfMonth. Quarterly SIPs only get months that are
 * a multiple of 3 from their start month. Weekly SIPs have no true weekly
 * schedule here — for simplicity they are treated like monthly (one
 * installment per month on dayOfMonth). Existing rows are left untouched via
 * onConflictDoNothing on the (sipId, dueDate) unique index.
 */
export async function generateUpcomingInstallments(): Promise<
  ActionState & { created?: number }
> {
  await requireSession();
  const created = await generateInstallmentsCore(getDb());
  revalidateSipPages();
  return { success: true, created };
}

export async function markInstallmentPaid(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing installment id" };

  const unitsRaw = formData.get("units");
  const navRaw = formData.get("nav");
  const units =
    typeof unitsRaw === "string" && unitsRaw.trim() ? unitsRaw.trim() : undefined;
  const nav = typeof navRaw === "string" && navRaw.trim() ? navRaw.trim() : undefined;
  if (units && (!/^\d+(\.\d+)?$/.test(units) || Number(units) <= 0))
    return { error: "Invalid units" };
  if (nav && (!/^\d+(\.\d+)?$/.test(nav) || Number(nav) <= 0))
    return { error: "Invalid NAV" };
  const debitAccountId = optional(formData, "debitAccountId");
  if (debitAccountId !== undefined && typeof debitAccountId !== "string")
    return { error: "Invalid debit account" };

  const db = getDb();
  const installment = await db.query.sipInstallments.findFirst({
    where: eq(sipInstallments.id, id),
    with: { sip: true },
  });
  if (!installment) return { error: "Installment not found" };
  if (installment.status === "paid") return { error: "Installment is already paid" };

  // Optional expense transaction from the debiting bank account.
  let transactionId: string | null = null;
  if (debitAccountId) {
    const category = await db.query.categories.findFirst({
      where: eq(categories.name, "Investment"),
    });
    const description = `SIP — ${installment.sip.name}`;
    const [txn] = await db
      .insert(transactions)
      .values({
        accountId: debitAccountId,
        type: "expense",
        amountPaise: installment.amountPaise,
        date: installment.dueDate,
        description,
        categoryId: category?.id ?? null,
        dedupeHash: dedupeHash(
          debitAccountId,
          installment.dueDate,
          installment.amountPaise,
          description,
        ),
      })
      .returning();
    transactionId = txn.id;
  }

  await db
    .update(sipInstallments)
    .set({
      status: "paid",
      units: units ?? null,
      nav: nav ?? null,
      transactionId,
    })
    .where(eq(sipInstallments.id, id));

  // Roll the purchase into the linked MF holding.
  if (installment.sip.mfHoldingId && units) {
    const holding = await db.query.mfHoldings.findFirst({
      where: eq(mfHoldings.id, installment.sip.mfHoldingId),
    });
    if (holding) {
      const newUnits = Number(holding.units) + Number(units);
      const newInvestedPaise = holding.investedPaise + installment.amountPaise;
      await db
        .update(mfHoldings)
        .set({
          units: newUnits.toFixed(4),
          investedPaise: newInvestedPaise,
          avgNav: (newInvestedPaise / newUnits / 100).toFixed(4),
          currentValuePaise:
            holding.currentNav != null
              ? Math.round(newUnits * Number(holding.currentNav) * 100)
              : holding.currentValuePaise,
          updatedAt: new Date(),
        })
        .where(eq(mfHoldings.id, holding.id));
    }
  }

  revalidateSipPages();
  return { success: true };
}

export async function markInstallmentSkipped(id: string) {
  await requireSession();
  await getDb()
    .update(sipInstallments)
    .set({ status: "skipped" })
    .where(eq(sipInstallments.id, id));
  revalidateSipPages();
}
