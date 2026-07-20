"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { categories, salaryEntries, transactions } from "@/lib/db/schema";
import { dedupeHash } from "@/lib/db/dedupe";
import { requireSession } from "@/lib/auth/guard";
import { parseINRToPaise } from "@/lib/utils/money";
import type { ActionState } from "./accounts";

const salarySchema = z.object({
  // <input type="month"> posts "YYYY-MM"; tolerate a full date too.
  month: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "Month is required"),
  employer: z.string().trim().min(1, "Employer is required"),
  gross: z.string().trim().min(1, "Gross amount is required"),
  net: z.string().trim().min(1, "Net amount is required"),
  basic: z.string().trim().optional(),
  hra: z.string().trim().optional(),
  specialAllowance: z.string().trim().optional(),
  pf: z.string().trim().optional(),
  professionalTax: z.string().trim().optional(),
  incomeTax: z.string().trim().optional(),
  creditedAccountId: z.string().uuid().optional(),
  creditedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid credited date")
    .optional(),
  notes: z.string().trim().optional(),
});

/** Radix Select posts "none" for the empty option — treat it as unset. */
function optional(formData: FormData, key: string) {
  const value = formData.get(key);
  return value && value !== "none" ? value : undefined;
}

function parseOptionalPaise(
  value: string | undefined,
  label: string,
): { paise: number | null } | { error: string } {
  if (!value) return { paise: null };
  const paise = parseINRToPaise(value);
  if (paise === null || paise < 0) return { error: `Invalid ${label} amount` };
  return { paise };
}

function parseSalary(formData: FormData) {
  const parsed = salarySchema.safeParse({
    month: formData.get("month"),
    employer: formData.get("employer"),
    gross: formData.get("gross"),
    net: formData.get("net"),
    basic: formData.get("basic") || undefined,
    hra: formData.get("hra") || undefined,
    specialAllowance: formData.get("specialAllowance") || undefined,
    pf: formData.get("pf") || undefined,
    professionalTax: formData.get("professionalTax") || undefined,
    incomeTax: formData.get("incomeTax") || undefined,
    creditedAccountId: optional(formData, "creditedAccountId"),
    creditedDate: formData.get("creditedDate") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const v = parsed.data;

  const grossPaise = parseINRToPaise(v.gross);
  if (grossPaise === null || grossPaise <= 0)
    return { error: "Invalid gross amount" } as const;
  const netPaise = parseINRToPaise(v.net);
  if (netPaise === null || netPaise <= 0)
    return { error: "Invalid net amount" } as const;

  const basic = parseOptionalPaise(v.basic, "basic pay");
  if ("error" in basic) return { error: basic.error } as const;
  const hra = parseOptionalPaise(v.hra, "HRA");
  if ("error" in hra) return { error: hra.error } as const;
  const specialAllowance = parseOptionalPaise(v.specialAllowance, "special allowance");
  if ("error" in specialAllowance) return { error: specialAllowance.error } as const;
  const pf = parseOptionalPaise(v.pf, "PF");
  if ("error" in pf) return { error: pf.error } as const;
  const professionalTax = parseOptionalPaise(v.professionalTax, "professional tax");
  if ("error" in professionalTax) return { error: professionalTax.error } as const;
  const incomeTax = parseOptionalPaise(v.incomeTax, "income tax");
  if ("error" in incomeTax) return { error: incomeTax.error } as const;

  const month = v.month.slice(0, 7) + "-01";

  return {
    values: {
      month,
      employer: v.employer,
      grossPaise,
      netPaise,
      basicPaise: basic.paise,
      hraPaise: hra.paise,
      specialAllowancePaise: specialAllowance.paise,
      pfPaise: pf.paise,
      professionalTaxPaise: professionalTax.paise,
      incomeTaxPaise: incomeTax.paise,
      creditedAccountId: v.creditedAccountId ?? null,
      notes: v.notes ?? null,
    },
    createTransaction: formData.get("createTransaction") === "on",
    creditedDate: v.creditedDate ?? month,
  } as const;
}

/** Postgres unique-violation (23505), possibly wrapped by drizzle. */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; cause?: unknown };
  if (e.code === "23505") return true;
  return isUniqueViolation(e.cause);
}

function revalidateSalaryPages() {
  revalidatePath("/income");
  revalidatePath("/transactions");
  revalidatePath("/");
}

export async function createSalaryEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const result = parseSalary(formData);
  if ("error" in result) return { error: result.error };
  const { values, createTransaction, creditedDate } = result;

  try {
    await getDb().transaction(async (tx) => {
      const [entry] = await tx.insert(salaryEntries).values(values).returning();

      if (createTransaction && values.creditedAccountId) {
        const salaryCategory = await tx.query.categories.findFirst({
          where: eq(categories.name, "Salary"),
        });
        const description = `Salary — ${values.employer}`;
        const [txn] = await tx
          .insert(transactions)
          .values({
            accountId: values.creditedAccountId,
            type: "income",
            amountPaise: values.netPaise,
            date: creditedDate,
            description,
            categoryId: salaryCategory?.id ?? null,
            source: "manual",
            dedupeHash: dedupeHash(
              values.creditedAccountId,
              creditedDate,
              values.netPaise,
              description,
            ),
          })
          .returning();
        await tx
          .update(salaryEntries)
          .set({ transactionId: txn.id })
          .where(eq(salaryEntries.id, entry.id));
      }
    });
  } catch (err) {
    if (isUniqueViolation(err))
      return { error: "An entry for this month already exists" };
    throw err;
  }

  revalidateSalaryPages();
  return { success: true };
}

export async function updateSalaryEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing entry id" };
  const result = parseSalary(formData);
  if ("error" in result) return { error: result.error };

  try {
    // Deliberately leaves the linked transaction untouched.
    await getDb()
      .update(salaryEntries)
      .set(result.values)
      .where(eq(salaryEntries.id, id));
  } catch (err) {
    if (isUniqueViolation(err))
      return { error: "An entry for this month already exists" };
    throw err;
  }

  revalidateSalaryPages();
  return { success: true };
}

export async function deleteSalaryEntry(id: string) {
  await requireSession();
  const db = getDb();
  const entry = await db.query.salaryEntries.findFirst({
    where: eq(salaryEntries.id, id),
  });
  if (!entry) return;

  await db.transaction(async (tx) => {
    await tx.delete(salaryEntries).where(eq(salaryEntries.id, id));
    if (entry.transactionId) {
      await tx.delete(transactions).where(eq(transactions.id, entry.transactionId));
    }
  });

  revalidateSalaryPages();
}
