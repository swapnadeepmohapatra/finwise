import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  accounts,
  assets,
  balanceSnapshots,
  budgets,
  categories,
  creditCardBills,
  loans,
  mfHoldings,
  salaryEntries,
  sipInstallments,
  sips,
  stockHoldings,
  transactions,
} from "@/lib/db/schema";
import { outstandingPaise } from "@/lib/finance/loan";
import { addMonths, daysUntil, monthStart, todayIST } from "@/lib/utils/dates";

// Shared, pure server-side query functions. No "use server" — these are plain
// library functions consumed by server components today and AI advisor tools
// later. Every return value is a plain serializable object; all amounts are
// integer paise.

const CASH_ACCOUNT_TYPES = ["bank", "cash", "wallet"] as const;

/** "YYYY-MM-DD" + n days → "YYYY-MM-DD" (UTC-safe on date-only strings) */
function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Net worth ──────────────────────────────────────────────────────────────

export type NetWorth = {
  totalPaise: number;
  assetsPaise: number;
  liabilitiesPaise: number;
  breakdown: {
    bankCashPaise: number;
    mfPaise: number;
    stocksPaise: number;
    otherAssetsPaise: number;
    unpaidBillsPaise: number;
    loansOutstandingPaise: number;
  };
};

export async function getNetWorth(): Promise<NetWorth> {
  const db = getDb();
  const [cashRows, mfRows, stockRows, billRows, assetRows, loanRows] =
    await Promise.all([
    db
      .select({ balancePaise: accounts.currentBalancePaise })
      .from(accounts)
      .where(
        and(eq(accounts.isActive, true), inArray(accounts.type, [...CASH_ACCOUNT_TYPES])),
      ),
    db
      .select({
        investedPaise: mfHoldings.investedPaise,
        currentValuePaise: mfHoldings.currentValuePaise,
      })
      .from(mfHoldings),
    db
      .select({
        investedPaise: stockHoldings.investedPaise,
        currentValuePaise: stockHoldings.currentValuePaise,
      })
      .from(stockHoldings),
    db
      .select({
        totalDuePaise: creditCardBills.totalDuePaise,
        paidPaise: creditCardBills.paidPaise,
      })
      .from(creditCardBills)
      .where(inArray(creditCardBills.status, ["unpaid", "partially_paid"])),
    db.select().from(assets),
    db.select().from(loans).where(eq(loans.isActive, true)),
  ]);

  const bankCashPaise = cashRows.reduce((sum, r) => sum + (r.balancePaise ?? 0), 0);
  const mfPaise = mfRows.reduce(
    (sum, r) => sum + (r.currentValuePaise ?? r.investedPaise),
    0,
  );
  const stocksPaise = stockRows.reduce(
    (sum, r) => sum + (r.currentValuePaise ?? r.investedPaise),
    0,
  );
  const unpaidBillsPaise = billRows.reduce(
    (sum, r) => sum + Math.max(0, r.totalDuePaise - r.paidPaise),
    0,
  );

  const otherAssetsPaise = assetRows.reduce((sum, a) => sum + a.valuePaise, 0);
  const loansOutstandingPaise = loanRows.reduce(
    (sum, l) => sum + outstandingPaise(l),
    0,
  );

  const assetsPaise = bankCashPaise + mfPaise + stocksPaise + otherAssetsPaise;
  const liabilitiesPaise = unpaidBillsPaise + loansOutstandingPaise;
  return {
    totalPaise: assetsPaise - liabilitiesPaise,
    assetsPaise,
    liabilitiesPaise,
    breakdown: {
      bankCashPaise,
      mfPaise,
      stocksPaise,
      otherAssetsPaise,
      unpaidBillsPaise,
      loansOutstandingPaise,
    },
  };
}

// ── Budgets ────────────────────────────────────────────────────────────────

export type BudgetStatus = {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  monthlyLimitPaise: number;
  spentPaise: number;
  /** spent / limit, e.g. 0.8 = 80% used */
  usedRatio: number;
};

/** Budget usage for the month containing `monthStartDate` (YYYY-MM-01). */
export async function getBudgetStatus(monthStartDate: string): Promise<BudgetStatus[]> {
  const db = getDb();
  const budgetRows = await db
    .select({
      budgetId: budgets.id,
      categoryId: budgets.categoryId,
      monthlyLimitPaise: budgets.monthlyLimitPaise,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(budgets)
    .innerJoin(categories, eq(budgets.categoryId, categories.id));
  if (budgetRows.length === 0) return [];

  const monthEnd = addMonths(monthStartDate, 1);
  const spentRows = await db
    .select({
      categoryId: transactions.categoryId,
      total: sql<string>`sum(${transactions.amountPaise})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "expense"),
        gte(transactions.date, monthStartDate),
        lt(transactions.date, monthEnd),
        inArray(
          transactions.categoryId,
          budgetRows.map((b) => b.categoryId),
        ),
      ),
    )
    .groupBy(transactions.categoryId);
  const spentByCategory = new Map(
    spentRows.map((r) => [r.categoryId, Number(r.total)]),
  );

  return budgetRows
    .map((b) => {
      const spentPaise = spentByCategory.get(b.categoryId) ?? 0;
      return {
        ...b,
        spentPaise,
        usedRatio: b.monthlyLimitPaise > 0 ? spentPaise / b.monthlyLimitPaise : 0,
      };
    })
    .sort((a, b) => b.usedRatio - a.usedRatio);
}

// ── Account balances ───────────────────────────────────────────────────────

export type AccountBalance = {
  id: string;
  name: string;
  type: "bank" | "credit_card" | "demat" | "cash" | "wallet";
  institution: string | null;
  balancePaise: number | null;
  creditLimitPaise: number | null;
};

export async function getAccountBalances(): Promise<AccountBalance[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
      institution: accounts.institution,
      balancePaise: accounts.currentBalancePaise,
      creditLimitPaise: accounts.creditLimitPaise,
    })
    .from(accounts)
    .where(eq(accounts.isActive, true))
    .orderBy(asc(accounts.createdAt));
  return rows;
}

// ── Spending by category ───────────────────────────────────────────────────

export type CategorySpend = {
  categoryId: string | null;
  categoryName: string;
  categoryColor: string | null;
  totalPaise: number;
  count: number;
};

export async function getSpendingByCategory({
  from,
  to,
}: {
  from: string;
  to: string;
}): Promise<CategorySpend[]> {
  const db = getDb();
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      totalPaise: sql<string>`sum(${transactions.amountPaise})`,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.type, "expense"),
        gte(transactions.date, from),
        lte(transactions.date, to),
      ),
    )
    .groupBy(transactions.categoryId, categories.name, categories.color);

  return rows
    .map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName ?? "Uncategorised",
      categoryColor: r.categoryColor,
      totalPaise: Number(r.totalPaise),
      count: r.count,
    }))
    .sort((a, b) => b.totalPaise - a.totalPaise);
}

// ── Monthly cashflow ───────────────────────────────────────────────────────

export type MonthlyCashflow = {
  month: string; // "YYYY-MM"
  incomePaise: number;
  expensePaise: number;
  investedPaise: number;
};

export async function getMonthlyCashflow(months: number): Promise<MonthlyCashflow[]> {
  const db = getDb();
  const currentMonthStart = monthStart();
  const fromDate = addMonths(currentMonthStart, -(months - 1));
  const endExclusive = addMonths(currentMonthStart, 1);

  const [txnRows, installmentRows] = await Promise.all([
    db
      .select({
        date: transactions.date,
        type: transactions.type,
        amountPaise: transactions.amountPaise,
      })
      .from(transactions)
      .where(
        and(
          ne(transactions.type, "transfer"),
          gte(transactions.date, fromDate),
          lt(transactions.date, endExclusive),
        ),
      ),
    db
      .select({
        dueDate: sipInstallments.dueDate,
        amountPaise: sipInstallments.amountPaise,
      })
      .from(sipInstallments)
      .where(
        and(
          eq(sipInstallments.status, "paid"),
          gte(sipInstallments.dueDate, fromDate),
          lt(sipInstallments.dueDate, endExclusive),
        ),
      ),
  ]);

  const result: MonthlyCashflow[] = [];
  const byMonth = new Map<string, MonthlyCashflow>();
  for (let i = 0; i < months; i++) {
    const month = addMonths(fromDate, i).slice(0, 7);
    const row: MonthlyCashflow = {
      month,
      incomePaise: 0,
      expensePaise: 0,
      investedPaise: 0,
    };
    result.push(row);
    byMonth.set(month, row);
  }

  for (const t of txnRows) {
    const row = byMonth.get(t.date.slice(0, 7));
    if (!row) continue;
    if (t.type === "income") row.incomePaise += t.amountPaise;
    else if (t.type === "expense") row.expensePaise += t.amountPaise;
  }
  for (const inst of installmentRows) {
    const row = byMonth.get(inst.dueDate.slice(0, 7));
    if (row) row.investedPaise += inst.amountPaise;
  }
  return result;
}

// ── Net worth trend ────────────────────────────────────────────────────────

export type NetWorthTrendPoint = {
  month: string; // "YYYY-MM"
  balancePaise: number;
};

export async function getNetWorthTrend(months: number): Promise<NetWorthTrendPoint[]> {
  const db = getDb();
  const currentMonthStart = monthStart();
  const fromMonth = addMonths(currentMonthStart, -(months - 1));

  const cashAccounts = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.isActive, true), inArray(accounts.type, [...CASH_ACCOUNT_TYPES])),
    );

  const monthsList = Array.from({ length: months }, (_, i) => addMonths(fromMonth, i));
  if (cashAccounts.length === 0) {
    return monthsList.map((m) => ({ month: m.slice(0, 7), balancePaise: 0 }));
  }

  // Single-user scale: fetch all snapshots up to the end of the current month
  // (sorted ascending) and reduce in TS — the latest snapshot per account at
  // or before each month-end.
  const snapshots = await db
    .select({
      accountId: balanceSnapshots.accountId,
      balancePaise: balanceSnapshots.balancePaise,
      asOf: balanceSnapshots.asOf,
    })
    .from(balanceSnapshots)
    .where(
      and(
        inArray(
          balanceSnapshots.accountId,
          cashAccounts.map((a) => a.id),
        ),
        lt(balanceSnapshots.asOf, addMonths(currentMonthStart, 1)),
      ),
    )
    .orderBy(asc(balanceSnapshots.asOf));

  return monthsList.map((mStart) => {
    const endExclusive = addMonths(mStart, 1);
    const latestByAccount = new Map<string, number>();
    for (const s of snapshots) {
      // ISO date strings compare lexicographically; snapshots are sorted
      // ascending, so the map ends up holding the latest value per account.
      if (s.asOf < endExclusive) latestByAccount.set(s.accountId, s.balancePaise);
    }
    let balancePaise = 0;
    for (const v of latestByAccount.values()) balancePaise += v;
    return { month: mStart.slice(0, 7), balancePaise };
  });
}

// ── Upcoming bills & SIP installments ──────────────────────────────────────

export type UpcomingCcBill = {
  id: string;
  cardName: string;
  dueDate: string;
  remainingPaise: number;
  daysUntil: number;
};

export type UpcomingSipInstallment = {
  id: string;
  sipName: string;
  dueDate: string;
  amountPaise: number;
  daysUntil: number;
};

export type UpcomingBills = {
  ccBills: UpcomingCcBill[];
  sipInstallments: UpcomingSipInstallment[];
};

export async function getUpcomingBills(days: number): Promise<UpcomingBills> {
  const db = getDb();
  const horizon = addDaysISO(todayIST(), days);

  const [billRows, installmentRows] = await Promise.all([
    db
      .select({
        id: creditCardBills.id,
        cardName: accounts.name,
        dueDate: creditCardBills.dueDate,
        totalDuePaise: creditCardBills.totalDuePaise,
        paidPaise: creditCardBills.paidPaise,
      })
      .from(creditCardBills)
      .innerJoin(accounts, eq(creditCardBills.accountId, accounts.id))
      .where(
        and(
          inArray(creditCardBills.status, ["unpaid", "partially_paid"]),
          lte(creditCardBills.dueDate, horizon),
        ),
      )
      .orderBy(asc(creditCardBills.dueDate)),
    db
      .select({
        id: sipInstallments.id,
        sipName: sips.name,
        dueDate: sipInstallments.dueDate,
        amountPaise: sipInstallments.amountPaise,
      })
      .from(sipInstallments)
      .innerJoin(sips, eq(sipInstallments.sipId, sips.id))
      .where(
        and(
          eq(sipInstallments.status, "upcoming"),
          lte(sipInstallments.dueDate, horizon),
        ),
      )
      .orderBy(asc(sipInstallments.dueDate)),
  ]);

  return {
    ccBills: billRows.map((b) => ({
      id: b.id,
      cardName: b.cardName,
      dueDate: b.dueDate,
      remainingPaise: Math.max(0, b.totalDuePaise - b.paidPaise),
      daysUntil: daysUntil(b.dueDate),
    })),
    sipInstallments: installmentRows.map((i) => ({
      id: i.id,
      sipName: i.sipName,
      dueDate: i.dueDate,
      amountPaise: i.amountPaise,
      daysUntil: daysUntil(i.dueDate),
    })),
  };
}

// ── Investment summary ─────────────────────────────────────────────────────

export type MfHoldingSummary = {
  id: string;
  schemeName: string;
  amc: string | null;
  holdingKind: "equity" | "debt" | "hybrid" | "elss" | "index" | "liquid" | "other";
  units: number;
  investedPaise: number;
  currentPaise: number;
  pnlPaise: number;
};

export type StockHoldingSummary = {
  id: string;
  ticker: string;
  exchange: "NSE" | "BSE";
  companyName: string | null;
  quantity: number;
  investedPaise: number;
  currentPaise: number;
  pnlPaise: number;
};

export type InvestmentSummary = {
  mf: { investedPaise: number; currentPaise: number; holdings: MfHoldingSummary[] };
  stocks: {
    investedPaise: number;
    currentPaise: number;
    holdings: StockHoldingSummary[];
  };
  totalInvestedPaise: number;
  totalCurrentPaise: number;
  pnlPaise: number;
};

export async function getInvestmentSummary(): Promise<InvestmentSummary> {
  const db = getDb();
  const [mfRows, stockRows] = await Promise.all([
    db.select().from(mfHoldings).orderBy(asc(mfHoldings.schemeName)),
    db.select().from(stockHoldings).orderBy(asc(stockHoldings.ticker)),
  ]);

  const mfHoldingsSummary: MfHoldingSummary[] = mfRows.map((h) => {
    const currentPaise = h.currentValuePaise ?? h.investedPaise;
    return {
      id: h.id,
      schemeName: h.schemeName,
      amc: h.amc,
      holdingKind: h.holdingKind,
      units: Number(h.units),
      investedPaise: h.investedPaise,
      currentPaise,
      pnlPaise: currentPaise - h.investedPaise,
    };
  });

  const stockHoldingsSummary: StockHoldingSummary[] = stockRows.map((h) => {
    const currentPaise = h.currentValuePaise ?? h.investedPaise;
    return {
      id: h.id,
      ticker: h.ticker,
      exchange: h.exchange,
      companyName: h.companyName,
      quantity: Number(h.quantity),
      investedPaise: h.investedPaise,
      currentPaise,
      pnlPaise: currentPaise - h.investedPaise,
    };
  });

  const mfInvested = mfHoldingsSummary.reduce((s, h) => s + h.investedPaise, 0);
  const mfCurrent = mfHoldingsSummary.reduce((s, h) => s + h.currentPaise, 0);
  const stocksInvested = stockHoldingsSummary.reduce((s, h) => s + h.investedPaise, 0);
  const stocksCurrent = stockHoldingsSummary.reduce((s, h) => s + h.currentPaise, 0);

  const totalInvestedPaise = mfInvested + stocksInvested;
  const totalCurrentPaise = mfCurrent + stocksCurrent;
  return {
    mf: {
      investedPaise: mfInvested,
      currentPaise: mfCurrent,
      holdings: mfHoldingsSummary,
    },
    stocks: {
      investedPaise: stocksInvested,
      currentPaise: stocksCurrent,
      holdings: stockHoldingsSummary,
    },
    totalInvestedPaise,
    totalCurrentPaise,
    pnlPaise: totalCurrentPaise - totalInvestedPaise,
  };
}

// ── Salary history ─────────────────────────────────────────────────────────

export type SalaryHistoryEntry = {
  month: string; // "YYYY-MM"
  employer: string;
  grossPaise: number;
  netPaise: number;
};

export async function getSalaryHistory(months: number): Promise<SalaryHistoryEntry[]> {
  const db = getDb();
  const rows = await db
    .select({
      month: salaryEntries.month,
      employer: salaryEntries.employer,
      grossPaise: salaryEntries.grossPaise,
      netPaise: salaryEntries.netPaise,
    })
    .from(salaryEntries)
    .orderBy(desc(salaryEntries.month))
    .limit(months);

  return rows.map((r) => ({
    month: r.month.slice(0, 7),
    employer: r.employer,
    grossPaise: r.grossPaise,
    netPaise: r.netPaise,
  }));
}

// ── Transactions ───────────────────────────────────────────────────────────

export type TransactionListItem = {
  id: string;
  date: string;
  description: string;
  merchant: string | null;
  type: "income" | "expense" | "transfer";
  amountPaise: number;
  accountName: string;
  categoryName: string | null;
};

export async function getRecentTransactions(limit: number): Promise<TransactionListItem[]> {
  const db = getDb();
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      merchant: transactions.merchant,
      type: transactions.type,
      amountPaise: transactions.amountPaise,
      accountName: accounts.name,
      categoryName: categories.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit);
}

export type TransactionSearchFilters = {
  query?: string;
  from?: string;
  to?: string;
  categoryName?: string;
  accountName?: string;
  type?: "income" | "expense" | "transfer";
  minPaise?: number;
  maxPaise?: number;
  limit?: number;
};

export async function searchTransactions(
  filters: TransactionSearchFilters,
): Promise<TransactionListItem[]> {
  const db = getDb();
  const conditions: SQL[] = [];

  if (filters.query) {
    const pattern = `%${filters.query}%`;
    const textMatch = or(
      ilike(transactions.description, pattern),
      ilike(transactions.merchant, pattern),
    );
    if (textMatch) conditions.push(textMatch);
  }
  if (filters.from) conditions.push(gte(transactions.date, filters.from));
  if (filters.to) conditions.push(lte(transactions.date, filters.to));
  if (filters.type) conditions.push(eq(transactions.type, filters.type));
  if (filters.minPaise != null)
    conditions.push(gte(transactions.amountPaise, filters.minPaise));
  if (filters.maxPaise != null)
    conditions.push(lte(transactions.amountPaise, filters.maxPaise));
  if (filters.categoryName)
    conditions.push(ilike(categories.name, filters.categoryName));
  if (filters.accountName) conditions.push(ilike(accounts.name, filters.accountName));

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);

  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      merchant: transactions.merchant,
      type: transactions.type,
      amountPaise: transactions.amountPaise,
      accountName: accounts.name,
      categoryName: categories.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit);
}
