import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { mfHoldings } from "@/lib/db/schema";
import { ensureWeeklyDigest } from "@/lib/ai/digest";
import { generateInstallmentsCore } from "@/lib/finance/installments";
import { refreshAllNavs } from "@/lib/refresh/navs";
import { todayIST } from "@/lib/utils/dates";

let lastRun: { date: string; at: number } | null = null;

/**
 * Lazy "cron" for local/dev use: fired via after() from the dashboard so
 * SIP installments, NAV refreshes and the weekly digest stay current without
 * platform cron. Throttled to once per hour; NAV refresh only when stale.
 * Every step is independent — one failure never blocks the others.
 */
export async function runDailyMaintenance(): Promise<void> {
  const today = todayIST();
  if (lastRun && lastRun.date === today && Date.now() - lastRun.at < 60 * 60 * 1000) {
    return;
  }
  lastRun = { date: today, at: Date.now() };

  try {
    await generateInstallmentsCore(getDb());
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "maintenance-installments-failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  try {
    const [row] = await getDb()
      .select({ latest: sql<string | null>`max(${mfHoldings.navAsOf})` })
      .from(mfHoldings);
    if (!row?.latest || row.latest < today) {
      await refreshAllNavs();
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "maintenance-navs-failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  try {
    await ensureWeeklyDigest();
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "maintenance-digest-failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
