import { tool } from "ai";
import { z } from "zod";
import { getMonthlyCashflow, getSpendingByCategory } from "@/lib/db/queries";
import { addMonths, monthStart } from "@/lib/utils/dates";
import { rupeesToPaise } from "@/lib/utils/money";
import { inrDeep } from "@/lib/ai/tools/finance-tools";

// What-if simulation tools: pure math over read-only queries. No approval
// needed — nothing here mutates data.

/**
 * Future value of a fixed monthly SIP (annuity-due: contribution at the start
 * of each month, compounded monthly). Negative contributions yield a negative
 * corpus, representing what a reduction gives up.
 */
function sipFutureValuePaise(
  monthlyPaise: number,
  months: number,
  annualReturnPct: number,
): number {
  const i = annualReturnPct / 100 / 12;
  if (i === 0) return monthlyPaise * months;
  return Math.round(monthlyPaise * (((1 + i) ** months - 1) / i) * (1 + i));
}

/** "YYYY-MM-DD" → the previous day (UTC-safe on date-only strings). */
function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const simTools = {
  simulateSipChange: tool({
    description:
      "What-if: project the corpus from increasing (or decreasing, via a negative amount) monthly SIP investment, and the impact on the monthly cash surplus. Uses the last 6 months of real cashflow for context. Pure simulation — changes nothing.",
    inputSchema: z.object({
      additionalMonthlyInr: z
        .number()
        .describe(
          "Extra monthly SIP amount in rupees; negative to simulate reducing SIPs",
        ),
      years: z
        .number()
        .int()
        .min(1)
        .max(30)
        .default(10)
        .describe("Investment horizon in years (default 10)"),
      expectedAnnualReturnPct: z
        .number()
        .min(0)
        .max(30)
        .default(12)
        .describe("Assumed annual return in percent (default 12)"),
    }),
    execute: async ({ additionalMonthlyInr, years, expectedAnnualReturnPct }) => {
      if (additionalMonthlyInr === 0) {
        return { error: "additionalMonthlyInr must be non-zero to simulate a change" };
      }
      const cashflow = await getMonthlyCashflow(6);
      const n = Math.max(cashflow.length, 1);
      const avg = (pick: (m: (typeof cashflow)[number]) => number) =>
        Math.round(cashflow.reduce((sum, m) => sum + pick(m), 0) / n);
      const avgIncomePaise = avg((m) => m.incomePaise);
      const avgExpensePaise = avg((m) => m.expensePaise);
      const avgInvestedPaise = avg((m) => m.investedPaise);
      const avgSurplusPaise = avgIncomePaise - avgExpensePaise - avgInvestedPaise;

      const additionalMonthlyPaise = rupeesToPaise(additionalMonthlyInr);
      const months = years * 12;
      const projectedCorpusPaise = sipFutureValuePaise(
        additionalMonthlyPaise,
        months,
        expectedAnnualReturnPct,
      );
      const totalContributedPaise = additionalMonthlyPaise * months;

      return inrDeep({
        assumptions: {
          years,
          expectedAnnualReturnPct,
          note: "Future value of a monthly SIP with contributions at the start of each month, compounded monthly at the assumed rate. Market returns are not guaranteed.",
        },
        additionalSip: {
          monthlyPaise: additionalMonthlyPaise,
          projectedCorpusPaise,
          totalContributedPaise,
          estimatedGainsPaise: projectedCorpusPaise - totalContributedPaise,
        },
        currentAvgPerMonth: {
          basis: "last 6 months",
          incomePaise: avgIncomePaise,
          expensePaise: avgExpensePaise,
          investedPaise: avgInvestedPaise,
          surplusPaise: avgSurplusPaise,
        },
        impactPerMonth: {
          newInvestedPaise: avgInvestedPaise + additionalMonthlyPaise,
          newSurplusPaise: avgSurplusPaise - additionalMonthlyPaise,
          surplusTurnsNegative: avgSurplusPaise - additionalMonthlyPaise < 0,
        },
      });
    },
  }),

  simulateExpenseCut: tool({
    description:
      "What-if: cutting spending in a category by a percentage. Uses the category's average monthly spend over the last 3 full months, and shows what the saving becomes in 10 years at 12% if invested via SIP. Pure simulation — changes nothing.",
    inputSchema: z.object({
      categoryName: z
        .string()
        .min(1)
        .describe("Expense category to cut, e.g. Food (matched case-insensitively)"),
      reductionPct: z
        .number()
        .min(1)
        .max(100)
        .describe("Percentage reduction to simulate, from 1 to 100"),
    }),
    execute: async ({ categoryName, reductionPct }) => {
      const from = addMonths(monthStart(), -3);
      const to = dayBefore(monthStart());
      const spends = await getSpendingByCategory({ from, to });

      const lower = categoryName.trim().toLowerCase();
      const match =
        spends.find((s) => s.categoryName.toLowerCase() === lower) ??
        spends.find((s) => s.categoryName.toLowerCase().includes(lower));
      if (!match) {
        return {
          error: `No spending found for category "${categoryName}" between ${from} and ${to}.`,
          availableCategories: spends.map((s) => s.categoryName),
        };
      }

      const avgMonthlySpendPaise = Math.round(match.totalPaise / 3);
      const monthlySavingPaise = Math.round((avgMonthlySpendPaise * reductionPct) / 100);
      const annualSavingPaise = monthlySavingPaise * 12;
      const sipYears = 10;
      const sipReturnPct = 12;

      return inrDeep({
        categoryName: match.categoryName,
        basis: { from, to, note: "average of the last 3 full months" },
        reductionPct,
        avgMonthlySpendPaise,
        monthlySavingPaise,
        annualSavingPaise,
        ifSavingIsInvested: {
          years: sipYears,
          expectedAnnualReturnPct: sipReturnPct,
          projectedCorpusPaise: sipFutureValuePaise(
            monthlySavingPaise,
            sipYears * 12,
            sipReturnPct,
          ),
          note: "Monthly saving invested as a SIP, compounded monthly at 12% p.a. — an assumption, not a guarantee.",
        },
      });
    },
  }),
};
