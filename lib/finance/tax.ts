/**
 * Indian income-tax slab engine — pure computation, no I/O.
 *
 * ── RULES ENCODED: FY 2025-26 (AY 2026-27) ────────────────────────────────
 * When the Finance Act changes rates, update ONLY the clearly-labeled
 * constants below (NEW_REGIME / OLD_REGIME and the deduction caps).
 * `computeTax` is generic slab-by-slab math and should not need edits.
 *
 * All amounts are integer paise (₹1 = 100 paise).
 *
 * Simplifying assumptions (salaried taxpayer):
 * - Standard deduction is always applied.
 * - No surcharge (incomes above ₹50L) and no §87A marginal relief.
 * - Old regime models only §80C and §80D deductions (no HRA/LTA/24b etc.).
 */

export type TaxRegimeId = "new" | "old";

/** One slab: income up to `uptoPaise` (null = no upper bound) taxed at `ratePct`. */
export type TaxSlab = { uptoPaise: number | null; ratePct: number };

export type TaxRegimeRules = {
  id: TaxRegimeId;
  label: string;
  /** Standard deduction for salaried taxpayers, paise. */
  standardDeductionPaise: number;
  /** Ordered lowest-first; the last slab must have `uptoPaise: null`. */
  slabs: TaxSlab[];
  /**
   * §87A rebate, applied when taxable income ≤ `taxableThresholdPaise`.
   * `maxRebatePaise: null` ⇒ the entire slab tax is rebated (tax becomes 0).
   */
  rebate: { taxableThresholdPaise: number; maxRebatePaise: number | null };
  /** Health & education cess as % of tax after rebate. */
  cessPct: number;
  /** Chapter VI-A deduction caps this regime allows (0 = not allowed). */
  allowedDeductions: { sec80cCapPaise: number; sec80dCapPaise: number };
};

/** ₹1 lakh in paise — convenience for the slab tables below. */
const LAKH_PAISE = 100_000 * 100;

// ── EDITABLE CONSTANTS — FY 2025-26 ────────────────────────────────────────

/** §80C investment cap (old regime), FY 2025-26: ₹1,50,000. */
export const SEC_80C_CAP_PAISE = 150_000 * 100;

/** §80D health-insurance premium cap (old regime, self/family, non-senior), FY 2025-26: ₹25,000. */
export const SEC_80D_CAP_PAISE = 25_000 * 100;

/** New (default) regime, FY 2025-26. */
export const NEW_REGIME: TaxRegimeRules = {
  id: "new",
  label: "New regime",
  standardDeductionPaise: 75_000 * 100, // ₹75,000 for salaried
  slabs: [
    { uptoPaise: 4 * LAKH_PAISE, ratePct: 0 }, // 0 – 4L: nil
    { uptoPaise: 8 * LAKH_PAISE, ratePct: 5 }, // 4L – 8L: 5%
    { uptoPaise: 12 * LAKH_PAISE, ratePct: 10 }, // 8L – 12L: 10%
    { uptoPaise: 16 * LAKH_PAISE, ratePct: 15 }, // 12L – 16L: 15%
    { uptoPaise: 20 * LAKH_PAISE, ratePct: 20 }, // 16L – 20L: 20%
    { uptoPaise: 24 * LAKH_PAISE, ratePct: 25 }, // 20L – 24L: 25%
    { uptoPaise: null, ratePct: 30 }, // above 24L: 30%
  ],
  // §87A: zero tax when taxable income ≤ ₹12,00,000 (full rebate).
  rebate: { taxableThresholdPaise: 12 * LAKH_PAISE, maxRebatePaise: null },
  cessPct: 4,
  // New regime allows neither §80C nor §80D.
  allowedDeductions: { sec80cCapPaise: 0, sec80dCapPaise: 0 },
};

/** Old (optional) regime, FY 2025-26. */
export const OLD_REGIME: TaxRegimeRules = {
  id: "old",
  label: "Old regime",
  standardDeductionPaise: 50_000 * 100, // ₹50,000 for salaried
  slabs: [
    { uptoPaise: 2.5 * LAKH_PAISE, ratePct: 0 }, // 0 – 2.5L: nil
    { uptoPaise: 5 * LAKH_PAISE, ratePct: 5 }, // 2.5L – 5L: 5%
    { uptoPaise: 10 * LAKH_PAISE, ratePct: 20 }, // 5L – 10L: 20%
    { uptoPaise: null, ratePct: 30 }, // above 10L: 30%
  ],
  // §87A: rebate up to ₹12,500 when taxable income ≤ ₹5,00,000.
  rebate: { taxableThresholdPaise: 5 * LAKH_PAISE, maxRebatePaise: 12_500 * 100 },
  cessPct: 4,
  allowedDeductions: {
    sec80cCapPaise: SEC_80C_CAP_PAISE,
    sec80dCapPaise: SEC_80D_CAP_PAISE,
  },
};

export const REGIMES: Record<TaxRegimeId, TaxRegimeRules> = {
  new: NEW_REGIME,
  old: OLD_REGIME,
};

// ── COMPUTATION (generic — no yearly edits needed) ─────────────────────────

export type TaxDeductionInputs = {
  /** Gross §80C investments (EPF + ELSS + life insurance …), pre-cap. */
  sec80cPaise?: number;
  /** Gross §80D health-insurance premiums, pre-cap. */
  sec80dPaise?: number;
};

export type TaxComputation = {
  regime: TaxRegimeId;
  grossPaise: number;
  /** Total deductions actually applied (standard + capped §80C/§80D). */
  deductionsAppliedPaise: number;
  taxablePaise: number;
  /** Slab tax after §87A rebate, before cess. */
  taxPaise: number;
  cessPaise: number;
  /** taxPaise + cessPaise. */
  totalPaise: number;
  /** totalPaise as % of gross income. */
  effectiveRatePct: number;
};

/**
 * Slab-by-slab income-tax computation for a salaried taxpayer.
 * Deduction caps are applied per the regime's rules (the new regime
 * ignores §80C/§80D by carrying zero caps).
 */
export function computeTax(
  regime: TaxRegimeId,
  grossAnnualPaise: number,
  deductions: TaxDeductionInputs = {},
): TaxComputation {
  const rules = REGIMES[regime];

  const sec80c = Math.min(
    Math.max(deductions.sec80cPaise ?? 0, 0),
    rules.allowedDeductions.sec80cCapPaise,
  );
  const sec80d = Math.min(
    Math.max(deductions.sec80dPaise ?? 0, 0),
    rules.allowedDeductions.sec80dCapPaise,
  );
  const deductionsAppliedPaise = Math.min(
    Math.max(grossAnnualPaise, 0),
    rules.standardDeductionPaise + sec80c + sec80d,
  );
  const taxablePaise = Math.max(0, grossAnnualPaise - deductionsAppliedPaise);

  // Slab-by-slab: tax each slice of taxable income at its slab rate.
  let taxPaise = 0;
  let prevUpper = 0;
  for (const slab of rules.slabs) {
    const upper = slab.uptoPaise ?? Number.POSITIVE_INFINITY;
    const slicePaise = Math.min(taxablePaise, upper) - prevUpper;
    if (slicePaise <= 0) break;
    taxPaise += Math.round((slicePaise * slab.ratePct) / 100);
    prevUpper = upper;
  }

  // §87A rebate.
  if (taxablePaise <= rules.rebate.taxableThresholdPaise) {
    taxPaise =
      rules.rebate.maxRebatePaise === null
        ? 0
        : Math.max(0, taxPaise - rules.rebate.maxRebatePaise);
  }

  const cessPaise = Math.round((taxPaise * rules.cessPct) / 100);
  const totalPaise = taxPaise + cessPaise;
  const effectiveRatePct =
    grossAnnualPaise > 0 ? (totalPaise / grossAnnualPaise) * 100 : 0;

  return {
    regime,
    grossPaise: grossAnnualPaise,
    deductionsAppliedPaise,
    taxablePaise,
    taxPaise,
    cessPaise,
    totalPaise,
    effectiveRatePct,
  };
}
