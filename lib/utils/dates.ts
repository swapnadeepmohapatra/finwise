import { format, parseISO } from "date-fns";

const IST_TIME_ZONE = "Asia/Kolkata";

/** Today's date in IST as "YYYY-MM-DD" */
export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "YYYY-MM-DD" → "21 Jul 2026" */
export function formatDate(isoDate: string): string {
  return format(parseISO(isoDate), "d MMM yyyy");
}

/** "YYYY-MM-DD" → "Jul 2026" */
export function formatMonth(isoDate: string): string {
  return format(parseISO(isoDate), "MMM yyyy");
}

/** First day of the month containing isoDate (defaults to current IST month) */
export function monthStart(isoDate?: string): string {
  return (isoDate ?? todayIST()).slice(0, 7) + "-01";
}

/** First day of the month n months before/after the given month */
export function addMonths(isoMonthStart: string, n: number): string {
  const [y, m] = isoMonthStart.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** Days between today (IST) and isoDate; negative if past */
export function daysUntil(isoDate: string): number {
  const a = parseISO(todayIST()).getTime();
  const b = parseISO(isoDate).getTime();
  return Math.round((b - a) / 86_400_000);
}
