import { generateText } from "ai";
import {
  getMonthlyCashflow,
  getNetWorth,
  getUpcomingBills,
} from "@/lib/db/queries";
import { todayIST } from "@/lib/utils/dates";
import { CHEAP_MODEL, hasGeminiKey } from "./models";

// One model call per day is plenty — cache in module scope keyed on IST date.
let cached: { date: string; text: string } | null = null;

export async function getDailyInsights(): Promise<string | null> {
  if (!hasGeminiKey()) return null;
  const today = todayIST();
  if (cached?.date === today) return cached.text;

  try {
    const [cashflow, netWorth, upcoming] = await Promise.all([
      getMonthlyCashflow(3),
      getNetWorth(),
      getUpcomingBills(30),
    ]);

    const summary = {
      today,
      currency: "INR (amounts in paise, divide by 100 for rupees)",
      last3MonthsCashflow: cashflow,
      netWorth,
      upcomingDues: upcoming,
    };

    const { text } = await generateText({
      model: CHEAP_MODEL,
      prompt: `You are a personal finance assistant for a user in India. Based on this snapshot of their finances, write EXACTLY 3 short, specific, actionable insights as markdown bullets (each one line, no heading, no preamble). Mention concrete rupee amounts formatted like ₹12,345. Focus on: spending vs income trend, upcoming dues, and one improvement suggestion.\n\n${JSON.stringify(summary)}`,
    });

    const trimmed = text.trim();
    if (!trimmed) return null;
    cached = { date: today, text: trimmed };
    return trimmed;
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "insights-failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}
