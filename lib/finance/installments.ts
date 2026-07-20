import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { sipInstallments, sips } from "@/lib/db/schema";
import { addMonths, monthStart } from "@/lib/utils/dates";

function monthDiff(fromMonthStart: string, toMonthStart: string): number {
  const [fy, fm] = fromMonthStart.split("-").map(Number);
  const [ty, tm] = toMonthStart.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * Ensures upcoming installments exist for every active SIP (current + next
 * month). Idempotent via the (sipId, dueDate) unique index. Shared by the
 * UI action, the cron route, and lazy maintenance.
 */
export async function generateInstallmentsCore(db: Db): Promise<number> {
  const activeSips = await db.select().from(sips).where(eq(sips.isActive, true));

  const thisMonth = monthStart();
  const candidateMonths = [thisMonth, addMonths(thisMonth, 1)];

  const rows: (typeof sipInstallments.$inferInsert)[] = [];
  for (const sip of activeSips) {
    for (const month of candidateMonths) {
      if (sip.frequency === "quarterly") {
        const diff = monthDiff(monthStart(sip.startDate), month);
        if (diff < 0 || diff % 3 !== 0) continue;
      }
      const dueDate = `${month.slice(0, 7)}-${String(sip.dayOfMonth).padStart(2, "0")}`;
      if (dueDate < sip.startDate) continue;
      if (sip.endDate && dueDate > sip.endDate) continue;
      rows.push({
        sipId: sip.id,
        dueDate,
        amountPaise: sip.amountPaise,
        status: "upcoming",
      });
    }
  }

  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(sipInstallments)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: sipInstallments.id });
  return inserted.length;
}
