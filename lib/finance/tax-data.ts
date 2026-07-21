/**
 * Server-side data assembly for the tax planner page.
 * Gathers salary, §80C and §80D components for the CURRENT Indian
 * financial year (1 Apr – 31 Mar, derived from today's IST date).
 *
 * All amounts are integer paise. The returned object is plain and
 * serializable so it can cross the RSC boundary if ever needed.
 */

import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { categories, salaryEntries, transactions } from "@/lib/db/schema";
import { todayIST } from "@/lib/utils/dates";
import { SEC_80C_CAP_PAISE, SEC_80D_CAP_PAISE } from "@/lib/finance/tax";

// ── Fiscal-year helpers ────────────────────────────────────────────────────

export type FiscalYear = {
  /** e.g. "FY 2026-27" */
  label: string;
  /** "YYYY-04-01" */
  startDate: string;
  /** "YYYY-03-31" */
  endDate: string;
};

/** Indian FY containing the given IST date (defaults to today). */
export function currentIndianFY(today: string = todayIST()): FiscalYear {
  const [year, month] = today.split("-").map(Number);
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  return {
    label: `FY ${startYear}-${String(endYear % 100).padStart(2, "0")}`,
    startDate: `${startYear}-04-01`,
    endDate: `${endYear}-03-31`,
  };
}

// ── Profile shape ──────────────────────────────────────────────────────────

export type TaxProfile = {
  fy: FiscalYear;
  salary: {
    entryCount: number;
    /** Sum of gross salary for FY months recorded so far. */
    actualGrossPaise: number;
    /** Sum of income tax (TDS) deducted in FY so far. */
    actualTdsPaise: number;
    /** Sum of employee PF deducted in FY so far. */
    actualPfPaise: number;
    /** Average monthly gross × 12 (0 when there are no entries). */
    projectedAnnualGrossPaise: number;
  };
  sec80c: {
    /** Employee PF from salary entries (FY to date). */
    epfPaise: number;
    /** Paid SIP installments into ELSS mutual-fund holdings (FY to date). */
    elssPaise: number;
    /** Expense transactions in the "Insurance" category (FY to date). */
    insurancePremiumsPaise: number;
    /** Uncapped sum of the three components. */
    totalPaise: number;
    /** totalPaise capped at the §80C limit. */
    cappedPaise: number;
    capPaise: number;
    /** Remaining room under the cap (0 when fully used). */
    headroomPaise: number;
  };
  sec80d: {
    /**
     * Expense transactions in the "Health" category whose description or
     * merchant looks like an insurance premium. Heuristic — needs review.
     */
    detectedPremiumsPaise: number;
    cappedPaise: number;
    capPaise: number;
    note: string;
  };
};

/** Matches health-insurance-premium-looking descriptions/merchants. */
const HEALTH_PREMIUM_RE = /insurance|premium|mediclaim/i;

// ── Assembly ───────────────────────────────────────────────────────────────

export async function getTaxProfile(): Promise<TaxProfile> {
  const db = getDb();
  const fy = currentIndianFY();

  const [salaryRows, paidInstallments, insuranceTxns, healthTxns] =
    await Promise.all([
      // Salary entries recorded for FY months so far.
      db
        .select({
          grossPaise: salaryEntries.grossPaise,
          incomeTaxPaise: salaryEntries.incomeTaxPaise,
          pfPaise: salaryEntries.pfPaise,
        })
        .from(salaryEntries)
        .where(
          and(
            gte(salaryEntries.month, fy.startDate),
            lte(salaryEntries.month, fy.endDate),
          ),
        ),
      // Paid SIP installments (with SIP → MF holding to detect ELSS).
      db.query.sipInstallments.findMany({
        where: (inst, { and, eq, gte, lte }) =>
          and(
            eq(inst.status, "paid"),
            gte(inst.dueDate, fy.startDate),
            lte(inst.dueDate, fy.endDate),
          ),
        with: { sip: { with: { mfHolding: true } } },
      }),
      // Life-insurance premiums: expenses in the "Insurance" category.
      db
        .select({ amountPaise: transactions.amountPaise })
        .from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(
            eq(transactions.type, "expense"),
            eq(categories.name, "Insurance"),
            gte(transactions.date, fy.startDate),
            lte(transactions.date, fy.endDate),
          ),
        ),
      // Candidate health-insurance premiums: expenses in "Health".
      db
        .select({
          amountPaise: transactions.amountPaise,
          description: transactions.description,
          merchant: transactions.merchant,
        })
        .from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(
            eq(transactions.type, "expense"),
            eq(categories.name, "Health"),
            gte(transactions.date, fy.startDate),
            lte(transactions.date, fy.endDate),
          ),
        ),
    ]);

  // Salary aggregates.
  const entryCount = salaryRows.length;
  const actualGrossPaise = salaryRows.reduce((sum, r) => sum + r.grossPaise, 0);
  const actualTdsPaise = salaryRows.reduce(
    (sum, r) => sum + (r.incomeTaxPaise ?? 0),
    0,
  );
  const actualPfPaise = salaryRows.reduce((sum, r) => sum + (r.pfPaise ?? 0), 0);
  const projectedAnnualGrossPaise =
    entryCount > 0 ? Math.round(actualGrossPaise / entryCount) * 12 : 0;

  // §80C components.
  const elssPaise = paidInstallments
    .filter((inst) => inst.sip?.mfHolding?.holdingKind === "elss")
    .reduce((sum, inst) => sum + inst.amountPaise, 0);
  const insurancePremiumsPaise = insuranceTxns.reduce(
    (sum, t) => sum + t.amountPaise,
    0,
  );
  const total80cPaise = actualPfPaise + elssPaise + insurancePremiumsPaise;

  // §80D heuristic detection.
  const detectedPremiumsPaise = healthTxns
    .filter(
      (t) =>
        HEALTH_PREMIUM_RE.test(t.description) ||
        (t.merchant != null && HEALTH_PREMIUM_RE.test(t.merchant)),
    )
    .reduce((sum, t) => sum + t.amountPaise, 0);

  return {
    fy,
    salary: {
      entryCount,
      actualGrossPaise,
      actualTdsPaise,
      actualPfPaise,
      projectedAnnualGrossPaise,
    },
    sec80c: {
      epfPaise: actualPfPaise,
      elssPaise,
      insurancePremiumsPaise,
      totalPaise: total80cPaise,
      cappedPaise: Math.min(total80cPaise, SEC_80C_CAP_PAISE),
      capPaise: SEC_80C_CAP_PAISE,
      headroomPaise: Math.max(0, SEC_80C_CAP_PAISE - total80cPaise),
    },
    sec80d: {
      detectedPremiumsPaise,
      cappedPaise: Math.min(detectedPremiumsPaise, SEC_80D_CAP_PAISE),
      capPaise: SEC_80D_CAP_PAISE,
      note: "detected health-insurance premiums — verify",
    },
  };
}
