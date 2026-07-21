import { generateText } from "ai";
import { getDb } from "@/lib/db";
import { aiDigests, type AiDigest } from "@/lib/db/schema";
import {
  getBudgetStatus,
  getSpendingByCategory,
  getUpcomingBills,
  searchTransactions,
} from "@/lib/db/queries";
import { formatDate, monthStart, todayIST } from "@/lib/utils/dates";
import { CHEAP_MODEL, hasGeminiKey } from "./models";

/** "YYYY-MM-DD" + n days → "YYYY-MM-DD" (UTC-safe on date-only strings) */
function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** IST Monday of the current week as "YYYY-MM-DD". */
export function currentWeekStart(): string {
  const today = todayIST();
  // getUTCDay on a date-only string parsed at UTC midnight: 0=Sun … 6=Sat.
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDaysISO(today, -((dow + 6) % 7));
}

/**
 * The cached digest row for the current IST week, or null. Read-only —
 * generation happens in ensureWeeklyDigest so render paths stay fast.
 */
export async function getWeeklyDigest(): Promise<AiDigest | null> {
  try {
    const row = await getDb().query.aiDigests.findFirst({
      where: (d, { eq }) => eq(d.weekStart, currentWeekStart()),
    });
    return row ?? null;
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "digest-read-failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

/**
 * Generates (or force-regenerates) the current week's digest and upserts it
 * into ai_digests. No-op without a Gemini key, or when a row already exists
 * and force is not set. Never throws.
 */
export async function ensureWeeklyDigest(opts?: {
  force?: boolean;
}): Promise<{ generated: boolean }> {
  if (!hasGeminiKey()) return { generated: false };

  const weekStart = currentWeekStart();
  const start = Date.now();
  try {
    const db = getDb();
    if (!opts?.force) {
      const existing = await db.query.aiDigests.findFirst({
        where: (d, { eq }) => eq(d.weekStart, weekStart),
      });
      if (existing) return { generated: false };
    }

    console.log(
      JSON.stringify({ level: "info", msg: "digest-start", weekStart, force: !!opts?.force }),
    );

    const weekEnd = addDaysISO(weekStart, 6);
    const prevWeekStart = addDaysISO(weekStart, -7);
    const prevWeekEnd = addDaysISO(weekStart, -1);

    const [thisWeekSpend, prevWeekSpend, upcoming, budgets, weekTxns] =
      await Promise.all([
        getSpendingByCategory({ from: weekStart, to: weekEnd }),
        getSpendingByCategory({ from: prevWeekStart, to: prevWeekEnd }),
        getUpcomingBills(7),
        getBudgetStatus(monthStart()),
        searchTransactions({ from: addDaysISO(todayIST(), -7), to: todayIST(), limit: 200 }),
      ]);

    const largestTxns = [...weekTxns]
      .sort((a, b) => b.amountPaise - a.amountPaise)
      .slice(0, 5)
      .map((t) => ({
        date: t.date,
        description: t.description,
        merchant: t.merchant,
        type: t.type,
        amountPaise: t.amountPaise,
        category: t.categoryName,
      }));

    const summary = {
      weekRange: `${formatDate(weekStart)} – ${formatDate(weekEnd)}`,
      today: todayIST(),
      currency: "INR (amounts in paise, divide by 100 for rupees)",
      thisWeekSpendingByCategory: thisWeekSpend,
      previousWeekSpendingByCategory: prevWeekSpend,
      duesNext7Days: upcoming,
      budgetStatusThisMonth: budgets.map((b) => ({
        category: b.categoryName,
        limitPaise: b.monthlyLimitPaise,
        spentPaise: b.spentPaise,
        usedRatio: Number(b.usedRatio.toFixed(2)),
      })),
      fiveLargestTransactionsPastWeek: largestTxns,
    };

    const { text } = await generateText({
      model: CHEAP_MODEL,
      prompt: `You are a personal finance assistant for a user in India. Write a compact weekly digest in markdown from the snapshot below.

Format:
- Start with a "### Weekly digest — <weekRange>" heading (use the provided weekRange verbatim).
- Then 4-8 short markdown bullets, one line each, no preamble and no closing remarks.

The bullets must cover:
1. Total spend this week vs last week, naming the biggest category movers (up or down).
2. Dues in the next 7 days (credit card bills and SIP installments), with dates.
3. Any budget at or above 80% of its monthly limit — warn about it. Skip if none.
4. One anomaly or notable observation (e.g. an unusually large transaction).
5. One concrete, actionable suggestion.

Always use concrete rupee amounts formatted like ₹12,345 (amounts in the data are paise — divide by 100). Never invent numbers not derivable from the data.

${JSON.stringify(summary)}`,
    });

    const content = text.trim();
    if (!content) {
      console.error(
        JSON.stringify({ level: "error", msg: "digest-empty", weekStart }),
      );
      return { generated: false };
    }

    await db
      .insert(aiDigests)
      .values({ weekStart, content })
      .onConflictDoUpdate({
        target: aiDigests.weekStart,
        set: { content, createdAt: new Date() },
      });

    console.log(
      JSON.stringify({
        level: "info",
        msg: "digest-done",
        weekStart,
        ms: Date.now() - start,
      }),
    );
    return { generated: true };
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "digest-failed",
        weekStart,
        error: err instanceof Error ? err.message : String(err),
        ms: Date.now() - start,
      }),
    );
    return { generated: false };
  }
}
