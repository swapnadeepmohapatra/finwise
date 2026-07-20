const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** 1234567 paise → "₹12,345.67" */
export function formatPaise(paise: number): string {
  return inr.format(paise / 100);
}

/** 1234500 paise → "₹12,345" (whole rupees, for tiles and tables) */
export function formatPaiseWhole(paise: number): string {
  return inrWhole.format(Math.round(paise / 100));
}

/** Compact Indian notation: ₹1.24 L, ₹2.30 Cr */
export function formatPaiseCompact(paise: number): string {
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  return inrWhole.format(rupees);
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/** Parse user input like "1,23,456.78" or "₹1500" → paise (null if invalid) */
export function parseINRToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (!cleaned || !/^-?\d*\.?\d{0,2}$/.test(cleaned)) return null;
  const rupees = Number(cleaned);
  if (Number.isNaN(rupees)) return null;
  return rupeesToPaise(rupees);
}
