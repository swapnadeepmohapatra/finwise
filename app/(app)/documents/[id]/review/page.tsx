import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { asc, gte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accounts, categories, transactions } from "@/lib/db/schema";
import { dedupeHash } from "@/lib/db/dedupe";
import { rupeesToPaise } from "@/lib/utils/money";
import { todayIST } from "@/lib/utils/dates";
import {
  bankStatementSchema,
  ccStatementSchema,
  payslipSchema,
} from "@/lib/ai/extraction/schemas";
import { StatementReview } from "@/components/features/documents/statement-review";
import { PayslipReview } from "@/components/features/documents/payslip-review";

export const metadata: Metadata = { title: "Review extraction" };
export const dynamic = "force-dynamic";

const FEE_RE =
  /\b(fee|charge|charges|penalty|late payment|amc|annual maintenance|gst)\b/i;

/** Normalized merchant (or description-prefix) key for recurrence matching. */
function normKey(merchant: string | null | undefined, description: string): string {
  const raw = merchant?.trim() ? merchant : description;
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 16);
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const doc = await db.query.documents.findFirst({
    where: (d, { eq }) => eq(d.id, id),
  });
  if (!doc) notFound();
  if (doc.status !== "extracted" || !doc.extractionJson) redirect("/documents");

  const back = (
    <Link
      href="/documents"
      className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> Documents
    </Link>
  );

  if (doc.docType === "payslip") {
    const parsed = payslipSchema.safeParse(doc.extractionJson);
    if (!parsed.success) redirect("/documents");
    return (
      <div className="flex flex-col gap-4">
        {back}
        <PayslipReview documentId={doc.id} fileName={doc.fileName} data={parsed.data} />
      </div>
    );
  }

  const isCc = doc.docType === "credit_card_statement";
  const parsed = isCc
    ? ccStatementSchema.safeParse(doc.extractionJson)
    : bankStatementSchema.safeParse(doc.extractionJson);
  if (!parsed.success) redirect("/documents");
  const data = parsed.data;

  const [accountRows, categoryRows] = await Promise.all([
    db
      .select()
      .from(accounts)
      .where(inArray(accounts.type, [isCc ? "credit_card" : "bank"]))
      .orderBy(asc(accounts.name)),
    db.select().from(categories).orderBy(asc(categories.name)),
  ]);

  // Flag likely duplicates against the linked account (if one was chosen).
  let duplicateIndexes: number[] = [];
  if (doc.linkedAccountId) {
    const hashes = data.transactions.map((t) =>
      dedupeHash(
        doc.linkedAccountId!,
        t.date,
        rupeesToPaise(t.amount),
        t.description,
      ),
    );
    if (hashes.length > 0) {
      const existing = await db
        .select({ hash: transactions.dedupeHash })
        .from(transactions)
        .where(inArray(transactions.dedupeHash, hashes));
      const existingSet = new Set(existing.map((e) => e.hash));
      duplicateIndexes = hashes
        .map((h, i) => (existingSet.has(h) ? i : -1))
        .filter((i) => i >= 0);
    }
  }

  // Per-row anomaly flags against the last 90 days of existing transactions:
  // "large" (>3× median expense), "subscription" (same merchant/description
  // prefix at ±5% amount in ≥2 distinct earlier months), "fee" (keywords).
  const historyFrom = (() => {
    const d = new Date(`${todayIST()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 90);
    return d.toISOString().slice(0, 10);
  })();
  const history = await db
    .select({
      date: transactions.date,
      type: transactions.type,
      amountPaise: transactions.amountPaise,
      description: transactions.description,
      merchant: transactions.merchant,
    })
    .from(transactions)
    .where(gte(transactions.date, historyFrom));

  const expenseAmounts = history
    .filter((t) => t.type === "expense")
    .map((t) => t.amountPaise)
    .sort((a, b) => a - b);
  let medianExpensePaise: number | null = null;
  if (expenseAmounts.length >= 10) {
    const mid = Math.floor(expenseAmounts.length / 2);
    medianExpensePaise =
      expenseAmounts.length % 2 === 1
        ? expenseAmounts[mid]
        : Math.round((expenseAmounts[mid - 1] + expenseAmounts[mid]) / 2);
  }

  const historyByKey = new Map<string, { amountPaise: number; month: string }[]>();
  for (const t of history) {
    const key = normKey(t.merchant, t.description);
    if (!key) continue;
    const entry = { amountPaise: t.amountPaise, month: t.date.slice(0, 7) };
    const list = historyByKey.get(key);
    if (list) list.push(entry);
    else historyByKey.set(key, [entry]);
  }

  const rowFlags = data.transactions
    .map((t, index) => {
      const flags: string[] = [];
      const amountPaise = rupeesToPaise(t.amount);
      if (t.direction === "debit") {
        if (medianExpensePaise != null && amountPaise > 3 * medianExpensePaise) {
          flags.push("large");
        }
        const rowMonth = t.date.slice(0, 7);
        const matches = historyByKey.get(normKey(t.merchant, t.description)) ?? [];
        const earlierMonths = new Set(
          matches
            .filter(
              (m) =>
                m.month < rowMonth &&
                Math.abs(m.amountPaise - amountPaise) <= amountPaise * 0.05,
            )
            .map((m) => m.month),
        );
        if (earlierMonths.size >= 2) flags.push("subscription");
      }
      if (FEE_RE.test(t.description)) flags.push("fee");
      return { index, flags };
    })
    .filter((f) => f.flags.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {back}
      <StatementReview
        documentId={doc.id}
        fileName={doc.fileName}
        isCcStatement={isCc}
        data={data}
        accounts={accountRows.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
        categories={categoryRows.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          color: c.color,
        }))}
        linkedAccountId={doc.linkedAccountId}
        duplicateIndexes={duplicateIndexes}
        rowFlags={rowFlags}
      />
    </div>
  );
}
