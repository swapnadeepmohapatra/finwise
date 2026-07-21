import { tool } from "ai";
import { z } from "zod";
import {
  getAccountBalances,
  getBudgetStatus,
  getInvestmentSummary,
  getMonthlyCashflow,
  getNetWorth,
  getSalaryHistory,
  getSpendingByCategory,
  getUpcomingBills,
  searchTransactions,
} from "@/lib/db/queries";
import { formatPaise } from "@/lib/utils/money";
import { monthStart } from "@/lib/utils/dates";

/**
 * Recursively converts `fooPaise: 12345` fields into `fooInr: 123.45` plus a
 * `fooFormatted: "₹123.45"` sibling, so the model reasons in rupees and can
 * quote preformatted amounts instead of doing arithmetic on paise.
 */
export function inrDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(inrDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (key.endsWith("Paise") && typeof v === "number") {
        const base = key.slice(0, -"Paise".length);
        out[`${base}Inr`] = v / 100;
        out[`${base}Formatted`] = formatPaise(v);
      } else {
        out[key] = inrDeep(v);
      }
    }
    return out;
  }
  return value;
}

const dateArg = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("ISO date YYYY-MM-DD");

export const financeTools = {
  getNetWorth: tool({
    description:
      "Get current net worth: total assets (bank/cash/wallet balances + mutual fund and stock current values) minus liabilities (unpaid credit card bills), with a breakdown.",
    inputSchema: z.object({}),
    execute: async () => inrDeep(await getNetWorth()),
  }),
  getAccountBalances: tool({
    description: "List all active accounts with their current balances and types.",
    inputSchema: z.object({}),
    execute: async () => inrDeep(await getAccountBalances()),
  }),
  getSpendingByCategory: tool({
    description:
      "Get expense totals grouped by category for a date range. Use for questions like 'how much did I spend on food last month'.",
    inputSchema: z.object({
      from: dateArg.describe("Range start (inclusive)"),
      to: dateArg.describe("Range end (inclusive)"),
    }),
    execute: async ({ from, to }) => inrDeep(await getSpendingByCategory({ from, to })),
  }),
  getMonthlyCashflow: tool({
    description:
      "Income vs expense vs SIP investment totals per month for the last N months. Use for savings-rate and trend questions.",
    inputSchema: z.object({
      months: z.number().int().min(1).max(24).describe("How many months back"),
    }),
    execute: async ({ months }) => inrDeep(await getMonthlyCashflow(months)),
  }),
  searchTransactions: tool({
    description:
      "Search individual transactions by text, date range, category, account, type or amount range. Returns newest first.",
    inputSchema: z.object({
      query: z.string().optional().describe("Text matched against description/merchant"),
      from: dateArg.optional(),
      to: dateArg.optional(),
      categoryName: z.string().optional(),
      accountName: z.string().optional(),
      type: z.enum(["income", "expense", "transfer"]).optional(),
      minInr: z.number().optional().describe("Minimum amount in rupees"),
      maxInr: z.number().optional().describe("Maximum amount in rupees"),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    execute: async ({ minInr, maxInr, ...rest }) =>
      inrDeep(
        await searchTransactions({
          ...rest,
          minPaise: minInr != null ? Math.round(minInr * 100) : undefined,
          maxPaise: maxInr != null ? Math.round(maxInr * 100) : undefined,
        }),
      ),
  }),
  getUpcomingBills: tool({
    description:
      "Unpaid credit card bills and upcoming SIP installments due within N days (overdue items have negative daysUntil).",
    inputSchema: z.object({
      days: z.number().int().min(1).max(120).describe("Look-ahead window in days"),
    }),
    execute: async ({ days }) => inrDeep(await getUpcomingBills(days)),
  }),
  getInvestmentSummary: tool({
    description:
      "Mutual fund and stock holdings with invested value, current value and P&L, per holding and in total.",
    inputSchema: z.object({}),
    execute: async () => inrDeep(await getInvestmentSummary()),
  }),
  getSalaryHistory: tool({
    description: "Salary entries (gross and net) for the last N months.",
    inputSchema: z.object({
      months: z.number().int().min(1).max(36).describe("How many months back"),
    }),
    execute: async ({ months }) => inrDeep(await getSalaryHistory(months)),
  }),
  getBudgetStatus: tool({
    description:
      "Budget usage for the current month: each budgeted category with its monthly limit, amount spent so far and usage ratio (usedRatio 0.8 = 80% used). Use for 'am I within budget' questions.",
    inputSchema: z.object({}),
    execute: async () => inrDeep(await getBudgetStatus(monthStart())),
  }),
};
