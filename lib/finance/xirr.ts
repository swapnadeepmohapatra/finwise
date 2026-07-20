/**
 * XIRR — annualized internal rate of return for irregularly spaced cash flows.
 *
 * Solves Σ amountᵢ / (1 + r)^tᵢ = 0 where tᵢ is years (365-day basis) from the
 * earliest flow. Newton–Raphson first, bisection over [-0.99, 10] as fallback.
 *
 * Unit check (run with npx tsx):
 *   xirr([
 *     { date: "2024-01-01", amountPaise: -100000 },
 *     { date: "2025-01-01", amountPaise: 110000 },
 *   ]) ≈ 0.0997 (≈0.10 — 366 elapsed days on a 365-day year basis)
 */

export type CashFlow = { date: string; amountPaise: number };

const DAYS_PER_YEAR = 365;
const MIN_RATE = -0.99;
const MAX_RATE = 10;
const MAX_NEWTON_ITERATIONS = 100;
const MAX_BISECTION_ITERATIONS = 200;

function toEpochDays(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000;
}

/**
 * Annualized rate as a decimal (0.142 = 14.2%), or null when the problem is
 * ill-posed (<2 flows, all flows same sign, zero elapsed time) or the solver
 * does not converge inside [-0.99, 10].
 */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const hasPositive = flows.some((f) => f.amountPaise > 0);
  const hasNegative = flows.some((f) => f.amountPaise < 0);
  if (!hasPositive || !hasNegative) return null;

  const day0 = Math.min(...flows.map((f) => toEpochDays(f.date)));
  const points = flows.map((f) => ({
    years: (toEpochDays(f.date) - day0) / DAYS_PER_YEAR,
    amount: f.amountPaise,
  }));
  if (points.some((p) => !Number.isFinite(p.years))) return null;
  if (points.every((p) => p.years === 0)) return null;

  const npv = (rate: number): number =>
    points.reduce((sum, p) => sum + p.amount / Math.pow(1 + rate, p.years), 0);
  const npvDerivative = (rate: number): number =>
    points.reduce(
      (sum, p) => sum - (p.years * p.amount) / Math.pow(1 + rate, p.years + 1),
      0,
    );

  // Convergence is judged on the step size, so the paise scale of the flows
  // does not matter.
  const STEP_TOLERANCE = 1e-9;

  // ── Newton–Raphson from a 10% guess ──────────────────────────────────────
  let rate = 0.1;
  for (let i = 0; i < MAX_NEWTON_ITERATIONS; i++) {
    const derivative = npvDerivative(rate);
    if (!Number.isFinite(derivative) || derivative === 0) break;
    const step = npv(rate) / derivative;
    if (!Number.isFinite(step)) break;
    const next = rate - step;
    if (next <= MIN_RATE || next >= MAX_RATE) break;
    rate = next;
    if (Math.abs(step) < STEP_TOLERANCE) return rate;
  }

  // ── Bisection fallback over [MIN_RATE, MAX_RATE] ─────────────────────────
  let lo = MIN_RATE;
  let hi = MAX_RATE;
  let npvLo = npv(lo);
  const npvHi = npv(hi);
  if (!Number.isFinite(npvLo) || !Number.isFinite(npvHi)) return null;
  if (npvLo === 0) return lo;
  if (npvHi === 0) return hi;
  if (npvLo * npvHi > 0) return null; // no sign change → no root in range

  for (let i = 0; i < MAX_BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const npvMid = npv(mid);
    if (npvMid === 0 || hi - lo < STEP_TOLERANCE) return mid;
    if (npvLo * npvMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      npvLo = npvMid;
    }
  }
  return null;
}
