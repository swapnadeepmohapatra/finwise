"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  categories,
  creditCardBills,
  documents,
  salaryEntries,
  sipInstallments,
  transactions,
} from "@/lib/db/schema";
import { dedupeHash } from "@/lib/db/dedupe";
import { requireSession } from "@/lib/auth/guard";
import { deleteUpload } from "@/lib/storage";
import { rupeesToPaise } from "@/lib/utils/money";
import type { ActionState } from "./accounts";

/** "YYYY-MM-DD" + n days → "YYYY-MM-DD" (UTC-safe on date-only strings) */
function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (negative if b is before a). */
function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

const reviewRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1),
  merchant: z.string().nullish(),
  direction: z.enum(["credit", "debit"]),
  amount: z.number().positive(),
  categoryName: z.string().nullish(),
  include: z.boolean(),
});

const billInfoSchema = z.object({
  statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodFrom: z.string().nullish(),
  periodTo: z.string().nullish(),
  totalDue: z.number().positive(),
  minDue: z.number().nullish(),
});

export async function commitStatementExtraction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const documentId = formData.get("documentId");
  const accountId = formData.get("accountId");
  const rowsRaw = formData.get("rows");
  const skipDuplicates = formData.get("skipDuplicates") === "on";
  const billRaw = formData.get("bill");

  if (typeof documentId !== "string" || !documentId)
    return { error: "Missing document" };
  if (typeof accountId !== "string" || !accountId || accountId === "none")
    return { error: "Choose the account these transactions belong to" };
  if (typeof rowsRaw !== "string") return { error: "Missing rows" };

  let rows: z.infer<typeof reviewRowSchema>[];
  try {
    rows = z.array(reviewRowSchema).parse(JSON.parse(rowsRaw));
  } catch {
    return { error: "Rows are invalid — please re-check the table" };
  }

  const db = getDb();
  const doc = await db.query.documents.findFirst({
    where: (d, { eq: eqOp }) => eqOp(d.id, documentId),
  });
  if (!doc) return { error: "Document not found" };
  if (doc.status === "committed") return { error: "Already committed" };
  const isCcStatement = doc.docType === "credit_card_statement";

  const included = rows.filter((r) => r.include);
  if (included.length === 0) return { error: "No rows selected" };

  const cats = await db.select().from(categories);
  const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));

  const candidate = included.map((r) => {
    const amountPaise = rupeesToPaise(r.amount);
    // On a credit card, debits are spends; on a bank account debit=expense too.
    const type = r.direction === "credit" ? ("income" as const) : ("expense" as const);
    const category = r.categoryName
      ? catByName.get(r.categoryName.toLowerCase())
      : undefined;
    return {
      accountId,
      type,
      amountPaise,
      date: r.date,
      description: r.description,
      merchant: r.merchant ?? null,
      categoryId: category && category.kind === type ? category.id
        : category && type === "expense" && category.kind === "expense" ? category.id
        : (category?.id ?? null),
      source: "import" as const,
      documentId,
      dedupeHash: dedupeHash(accountId, r.date, amountPaise, r.description),
    };
  });

  let toInsert = candidate;
  let skipped = 0;
  if (skipDuplicates) {
    const hashes = candidate.map((c) => c.dedupeHash);
    const existing = await db
      .select({ hash: transactions.dedupeHash })
      .from(transactions)
      .where(inArray(transactions.dedupeHash, hashes));
    const existingSet = new Set(existing.map((e) => e.hash));
    toInsert = candidate.filter((c) => !existingSet.has(c.dedupeHash));
    skipped = candidate.length - toInsert.length;
  }

  let bill: z.infer<typeof billInfoSchema> | null = null;
  if (isCcStatement && typeof billRaw === "string" && billRaw) {
    try {
      bill = billInfoSchema.parse(JSON.parse(billRaw));
    } catch {
      return { error: "Bill details are invalid" };
    }
  }

  let sipMatched = 0;
  try {
    await db.transaction(async (tx) => {
      let inserted: {
        id: string;
        date: string;
        type: "income" | "expense" | "transfer";
        amountPaise: number;
      }[] = [];
      if (toInsert.length > 0) {
        inserted = await tx.insert(transactions).values(toInsert).returning({
          id: transactions.id,
          date: transactions.date,
          type: transactions.type,
          amountPaise: transactions.amountPaise,
        });
      }

      // Bank statements: auto-mark upcoming SIP installments as paid when an
      // inserted expense matches the amount exactly and is due within ±7 days.
      if (!isCcStatement) {
        const expenseRows = inserted.filter((r) => r.type === "expense");
        if (expenseRows.length > 0) {
          const dates = expenseRows.map((r) => r.date).sort();
          const upcoming = await tx
            .select({
              id: sipInstallments.id,
              dueDate: sipInstallments.dueDate,
              amountPaise: sipInstallments.amountPaise,
            })
            .from(sipInstallments)
            .where(
              and(
                eq(sipInstallments.status, "upcoming"),
                gte(sipInstallments.dueDate, addDaysISO(dates[0], -7)),
                lte(sipInstallments.dueDate, addDaysISO(dates[dates.length - 1], 7)),
              ),
            )
            .orderBy(asc(sipInstallments.dueDate));

          const usedTxnIds = new Set<string>();
          for (const inst of upcoming) {
            // First match wins per installment; each transaction pays at most one.
            const match = expenseRows.find(
              (r) =>
                !usedTxnIds.has(r.id) &&
                r.amountPaise === inst.amountPaise &&
                Math.abs(daysBetween(r.date, inst.dueDate)) <= 7,
            );
            if (!match) continue;
            usedTxnIds.add(match.id);
            await tx
              .update(sipInstallments)
              .set({ status: "paid", transactionId: match.id })
              .where(eq(sipInstallments.id, inst.id));
            sipMatched++;
          }
        }
      }

      if (bill) {
        await tx
          .insert(creditCardBills)
          .values({
            accountId,
            statementDate: bill.statementDate,
            dueDate: bill.dueDate,
            periodStart: bill.periodFrom ?? bill.statementDate,
            periodEnd: bill.periodTo ?? bill.statementDate,
            totalDuePaise: rupeesToPaise(bill.totalDue),
            minDuePaise: bill.minDue != null ? rupeesToPaise(bill.minDue) : null,
            documentId,
          })
          .onConflictDoNothing();
      }
      await tx
        .update(documents)
        .set({ status: "committed", committedAt: new Date(), linkedAccountId: accountId })
        .where(eq(documents.id, documentId));
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "commit-extraction-failed",
        documentId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return { error: "Failed to save — nothing was committed. Try again." };
  }

  revalidatePath("/documents");
  revalidatePath("/transactions");
  revalidatePath("/credit-cards");
  if (sipMatched > 0) revalidatePath("/investments");
  revalidatePath("/");
  const messageParts: string[] = [];
  if (skipped > 0)
    messageParts.push(`${toInsert.length} added, ${skipped} duplicates skipped`);
  if (sipMatched > 0)
    messageParts.push(`${sipMatched} SIP installments auto-marked paid`);
  return {
    success: true,
    error: messageParts.length > 0 ? messageParts.join(", ") : undefined,
  };
}

const payslipCommitSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  employer: z.string().trim().min(1, "Employer is required"),
  gross: z.number().positive(),
  net: z.number().positive(),
  basic: z.number().nullish(),
  hra: z.number().nullish(),
  specialAllowance: z.number().nullish(),
  pf: z.number().nullish(),
  professionalTax: z.number().nullish(),
  incomeTax: z.number().nullish(),
});

export async function commitPayslipExtraction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const documentId = formData.get("documentId");
  if (typeof documentId !== "string" || !documentId)
    return { error: "Missing document" };

  const num = (key: string) => {
    const v = formData.get(key);
    if (typeof v !== "string" || !v.trim()) return undefined;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  };

  const parsed = payslipCommitSchema.safeParse({
    month: formData.get("month"),
    employer: formData.get("employer"),
    gross: num("gross"),
    net: num("net"),
    basic: num("basic"),
    hra: num("hra"),
    specialAllowance: num("specialAllowance"),
    pf: num("pf"),
    professionalTax: num("professionalTax"),
    incomeTax: num("incomeTax"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;

  const db = getDb();
  const toPaise = (n: number | null | undefined) =>
    n != null ? rupeesToPaise(n) : null;

  await db.transaction(async (tx) => {
    await tx
      .insert(salaryEntries)
      .values({
        month: `${v.month}-01`,
        employer: v.employer,
        grossPaise: rupeesToPaise(v.gross),
        netPaise: rupeesToPaise(v.net),
        basicPaise: toPaise(v.basic),
        hraPaise: toPaise(v.hra),
        specialAllowancePaise: toPaise(v.specialAllowance),
        pfPaise: toPaise(v.pf),
        professionalTaxPaise: toPaise(v.professionalTax),
        incomeTaxPaise: toPaise(v.incomeTax),
        documentId,
      })
      .onConflictDoUpdate({
        target: salaryEntries.month,
        set: {
          employer: v.employer,
          grossPaise: rupeesToPaise(v.gross),
          netPaise: rupeesToPaise(v.net),
          basicPaise: toPaise(v.basic),
          hraPaise: toPaise(v.hra),
          specialAllowancePaise: toPaise(v.specialAllowance),
          pfPaise: toPaise(v.pf),
          professionalTaxPaise: toPaise(v.professionalTax),
          incomeTaxPaise: toPaise(v.incomeTax),
          documentId,
        },
      });
    await tx
      .update(documents)
      .set({ status: "committed", committedAt: new Date() })
      .where(eq(documents.id, documentId));
  });

  revalidatePath("/documents");
  revalidatePath("/income");
  revalidatePath("/");
  return { success: true };
}

export async function discardExtraction(id: string) {
  await requireSession();
  await getDb()
    .update(documents)
    .set({ status: "uploaded", extractionJson: null, extractionError: null })
    .where(eq(documents.id, id));
  revalidatePath("/documents");
}

export async function deleteDocument(id: string) {
  await requireSession();
  const db = getDb();
  const doc = await db.query.documents.findFirst({
    where: (d, { eq: eqOp }) => eqOp(d.id, id),
  });
  if (!doc) return;
  await db.delete(documents).where(eq(documents.id, id));
  await deleteUpload(doc);
  revalidatePath("/documents");
}
