import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { after } from "next/server";
import { ArrowRight, CreditCard, Repeat, TrendingDown, TrendingUp } from "lucide-react";
import { runDailyMaintenance } from "@/lib/maintenance";
import { InsightsCard } from "@/components/features/insights-card";
import { DigestCard } from "@/components/features/digest-card";
import { BudgetSummaryCard } from "@/components/features/planning/budget-summary-card";
import { CashflowChart } from "@/components/charts/cashflow-chart";
import { CategoryDonut } from "@/components/charts/category-donut";
import { NetworthChart } from "@/components/charts/networth-chart";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getInvestmentSummary,
  getMonthlyCashflow,
  getNetWorth,
  getNetWorthTrend,
  getRecentTransactions,
  getSpendingByCategory,
  getUpcomingBills,
} from "@/lib/db/queries";
import { cn } from "@/lib/utils";
import { formatDate, formatMonth, monthStart, todayIST } from "@/lib/utils/dates";
import { formatPaise, formatPaiseCompact } from "@/lib/utils/money";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function dueChip(days: number): { label: string; overdue: boolean } {
  if (days < 0) return { label: `${-days}d overdue`, overdue: true };
  if (days === 0) return { label: "due today", overdue: false };
  return { label: `in ${days}d`, overdue: false };
}

export default async function DashboardPage() {
  // Lazy local "cron": SIP installments, stale NAV refresh, weekly digest.
  after(runDailyMaintenance);

  const currentMonthStart = monthStart();
  const today = todayIST();

  const [netWorth, cashflow, spending, trend, upcoming, recent, investments] =
    await Promise.all([
      getNetWorth(),
      getMonthlyCashflow(6),
      getSpendingByCategory({ from: currentMonthStart, to: today }),
      getNetWorthTrend(6),
      getUpcomingBills(30),
      getRecentTransactions(8),
      getInvestmentSummary(),
    ]);

  const thisMonth = cashflow[cashflow.length - 1];
  const monthSpendPaise = thisMonth?.expensePaise ?? 0;
  const monthIncomePaise = thisMonth?.incomePaise ?? 0;
  const pnlPaise = investments.pnlPaise;
  const pnlPositive = pnlPaise >= 0;

  const dues = [
    ...upcoming.ccBills.map((b) => ({
      kind: "bill" as const,
      id: b.id,
      name: b.cardName,
      dueDate: b.dueDate,
      amountPaise: b.remainingPaise,
      daysUntil: b.daysUntil,
    })),
    ...upcoming.sipInstallments.map((s) => ({
      kind: "sip" as const,
      id: s.id,
      name: s.sipName,
      dueDate: s.dueDate,
      amountPaise: s.amountPaise,
      daysUntil: s.daysUntil,
    })),
  ].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Net worth</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">
              {formatPaiseCompact(netWorth.totalPaise)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Assets {formatPaiseCompact(netWorth.assetsPaise)} · Liabilities{" "}
            {formatPaiseCompact(netWorth.liabilitiesPaise)}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>This month spend</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">
              {formatPaiseCompact(monthSpendPaise)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {formatMonth(currentMonthStart)}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>This month income</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">
              {formatPaiseCompact(monthIncomePaise)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {formatMonth(currentMonthStart)}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>Investments</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">
              {formatPaiseCompact(investments.totalCurrentPaise)}
            </CardTitle>
          </CardHeader>
          <CardContent
            className={cn(
              "flex items-center gap-1 text-xs",
              pnlPositive ? "text-emerald-500" : "text-red-500",
            )}
          >
            {pnlPositive ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            <span className="font-mono tabular-nums">
              {pnlPositive ? "+" : ""}
              {formatPaiseCompact(pnlPaise)}
            </span>
            <span className="text-muted-foreground">P&amp;L</span>
          </CardContent>
        </Card>
      </div>

      {/* AI insights (renders only when a Gemini key is configured) */}
      <Suspense fallback={null}>
        <InsightsCard />
      </Suspense>

      {/* Weekly digest + budget usage */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Suspense fallback={null}>
          <DigestCard />
        </Suspense>
        <Suspense fallback={null}>
          <BudgetSummaryCard />
        </Suspense>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cashflow</CardTitle>
            <CardDescription>
              Income vs expense vs invested · last 6 months
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CashflowChart data={cashflow} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
            <CardDescription>{formatMonth(currentMonthStart)}</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryDonut data={spending} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Net worth trend</CardTitle>
          <CardDescription>
            Bank, cash &amp; wallet balances · last 6 months
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NetworthChart data={trend} />
        </CardContent>
      </Card>

      {/* Upcoming dues + recent transactions */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming dues</CardTitle>
            <CardDescription>Credit card bills and SIP installments</CardDescription>
          </CardHeader>
          <CardContent>
            {dues.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing due in the next 30 days.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {dues.map((due) => {
                  const chip = dueChip(due.daysUntil);
                  return (
                    <li
                      key={`${due.kind}-${due.id}`}
                      className="flex items-center gap-3"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        {due.kind === "bill" ? (
                          <CreditCard className="h-4 w-4" />
                        ) : (
                          <Repeat className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{due.name}</p>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {formatDate(due.dueDate)}
                          <Badge variant={chip.overdue ? "destructive" : "outline"}>
                            {chip.label}
                          </Badge>
                        </p>
                      </div>
                      <span className="font-mono text-sm tabular-nums">
                        {formatPaise(due.amountPaise)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
            <CardDescription>Latest activity across accounts</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No transactions yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {recent.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{t.description}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(t.date)} · {t.accountName}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-sm tabular-nums",
                        t.type === "income" && "text-emerald-500",
                        t.type === "expense" && "text-red-500",
                        t.type === "transfer" && "text-muted-foreground",
                      )}
                    >
                      {t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}
                      {formatPaise(t.amountPaise)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/transactions"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
