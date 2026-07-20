import type { Metadata } from "next";
import { Suspense } from "react";
import { and, asc, desc, eq, gte, ilike, lt, or, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accounts, categories, transactions } from "@/lib/db/schema";
import { addMonths, todayIST } from "@/lib/utils/dates";
import { TransactionFilters } from "@/components/features/transactions/transaction-filters";
import { TransactionsView } from "@/components/features/transactions/transactions-view";
import type { TxnListItem } from "@/components/features/transactions/types";

export const metadata: Metadata = { title: "Transactions" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const defaultMonth = todayIST().slice(0, 7);
  const month = str(sp.month) ?? defaultMonth;
  const accountId = str(sp.account);
  const categoryId = str(sp.category);
  const type = str(sp.type);
  const q = str(sp.q);

  const db = getDb();

  const conditions: SQL[] = [];
  if (/^\d{4}-\d{2}$/.test(month)) {
    const from = `${month}-01`;
    conditions.push(gte(transactions.date, from), lt(transactions.date, addMonths(from, 1)));
  }
  if (accountId) conditions.push(eq(transactions.accountId, accountId));
  if (categoryId) conditions.push(eq(transactions.categoryId, categoryId));
  if (type === "income" || type === "expense" || type === "transfer")
    conditions.push(eq(transactions.type, type));
  if (q) {
    const clause = or(
      ilike(transactions.description, `%${q}%`),
      ilike(transactions.merchant, `%${q}%`),
    );
    if (clause) conditions.push(clause);
  }

  const [rows, accountRows, categoryRows] = await Promise.all([
    db.query.transactions.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      with: { account: true, category: true, counterAccount: true },
      orderBy: [desc(transactions.date), desc(transactions.createdAt)],
      limit: 300,
    }),
    db.select().from(accounts).where(eq(accounts.isActive, true)).orderBy(asc(accounts.name)),
    db.select().from(categories).orderBy(asc(categories.name)),
  ]);

  const txns: TxnListItem[] = rows.map((t) => ({
    id: t.id,
    type: t.type,
    amountPaise: t.amountPaise,
    date: t.date,
    description: t.description,
    merchant: t.merchant,
    notes: t.notes,
    accountId: t.accountId,
    accountName: t.account.name,
    categoryId: t.categoryId,
    categoryName: t.category?.name ?? null,
    categoryColor: t.category?.color ?? null,
    counterAccountId: t.counterAccountId,
    counterAccountName: t.counterAccount?.name ?? null,
  }));

  const accountOptions = accountRows.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
  }));
  const categoryOptions = categoryRows.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    color: c.color,
  }));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
      <Suspense>
        <TransactionFilters
          accounts={accountOptions}
          categories={categoryOptions}
          defaultMonth={defaultMonth}
        />
      </Suspense>
      <TransactionsView
        txns={txns}
        accounts={accountOptions}
        categories={categoryOptions}
      />
    </div>
  );
}
