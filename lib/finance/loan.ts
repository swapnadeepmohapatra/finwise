import type { Loan } from "@/lib/db/schema";
import { todayIST } from "@/lib/utils/dates";

/** Whole months elapsed from an ISO date to today (IST), floored at 0. */
export function monthsElapsed(startDate: string, today = todayIST()): number {
  const [sy, sm] = startDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const sd = Number(startDate.split("-")[2]);
  let months = (ty - sy) * 12 + (tm - sm);
  if (td < sd) months -= 1; // EMI for the current month not yet paid
  return Math.max(0, months);
}

/**
 * Outstanding principal after n EMI payments (standard reducing-balance):
 * P(1+r)^n − EMI·((1+r)^n − 1)/r, clamped to [0, ∞); r = monthly rate.
 */
export function outstandingPaise(loan: Loan, today = todayIST()): number {
  const n = Math.min(monthsElapsed(loan.startDate, today), loan.tenureMonths);
  const r = Number(loan.annualRatePct) / 12 / 100;
  if (r === 0) {
    return Math.max(0, loan.principalPaise - loan.emiPaise * n);
  }
  const growth = Math.pow(1 + r, n);
  const outstanding =
    loan.principalPaise * growth - (loan.emiPaise * (growth - 1)) / r;
  return Math.max(0, Math.round(outstanding));
}

export function remainingMonths(loan: Loan, today = todayIST()): number {
  return Math.max(0, loan.tenureMonths - monthsElapsed(loan.startDate, today));
}
