"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { loans } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/guard";
import { parseINRToPaise } from "@/lib/utils/money";
import type { ActionState } from "./accounts";

const loanSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  lender: z.string().trim().optional(),
  principal: z.string().trim().min(1, "Principal is required"),
  annualRatePct: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, "Invalid interest rate"),
  emi: z.string().trim().min(1, "EMI is required"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date is required"),
  tenureMonths: z.coerce
    .number()
    .int("Tenure must be whole months")
    .min(1, "Tenure must be at least 1 month")
    .max(600, "Tenure must be at most 600 months"),
  notes: z.string().trim().optional(),
});

function revalidateLoanPages() {
  revalidatePath("/planning/assets");
  revalidatePath("/");
}

function parseLoan(formData: FormData) {
  const parsed = loanSchema.safeParse({
    name: formData.get("name"),
    lender: formData.get("lender") || undefined,
    principal: formData.get("principal"),
    annualRatePct: formData.get("annualRatePct"),
    emi: formData.get("emi"),
    startDate: formData.get("startDate"),
    tenureMonths: formData.get("tenureMonths"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const v = parsed.data;

  const principalPaise = parseINRToPaise(v.principal);
  if (principalPaise === null || principalPaise <= 0)
    return { error: "Invalid principal" } as const;
  const emiPaise = parseINRToPaise(v.emi);
  if (emiPaise === null || emiPaise <= 0) return { error: "Invalid EMI" } as const;

  return {
    values: {
      name: v.name,
      lender: v.lender ?? null,
      principalPaise,
      // numeric column — stored as a normalized string, e.g. "9.20"
      annualRatePct: Number(v.annualRatePct).toFixed(2),
      emiPaise,
      startDate: v.startDate,
      tenureMonths: v.tenureMonths,
      notes: v.notes ?? null,
    },
  } as const;
}

export async function createLoan(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const result = parseLoan(formData);
  if ("error" in result) return { error: result.error };
  await getDb().insert(loans).values(result.values);
  revalidateLoanPages();
  return { success: true };
}

export async function updateLoan(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing loan id" };
  const result = parseLoan(formData);
  if ("error" in result) return { error: result.error };
  await getDb().update(loans).set(result.values).where(eq(loans.id, id));
  revalidateLoanPages();
  return { success: true };
}

export async function toggleLoanActive(id: string, isActive: boolean) {
  await requireSession();
  await getDb().update(loans).set({ isActive }).where(eq(loans.id, id));
  revalidateLoanPages();
}

export async function deleteLoan(id: string) {
  await requireSession();
  await getDb().delete(loans).where(eq(loans.id, id));
  revalidateLoanPages();
}
