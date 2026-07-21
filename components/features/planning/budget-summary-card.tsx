import Link from "next/link";
import { getBudgetStatus } from "@/lib/db/queries";
import { monthStart } from "@/lib/utils/dates";
import { formatPaiseWhole } from "@/lib/utils/money";
import { BudgetProgress } from "./budget-progress";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Compact dashboard card: top 4 budgets by usage this month.
 * Renders nothing when no budgets exist.
 */
export async function BudgetSummaryCard() {
  const statuses = await getBudgetStatus(monthStart());
  if (statuses.length === 0) return null;

  // getBudgetStatus returns rows sorted by usedRatio descending.
  const top = statuses.slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budgets</CardTitle>
        <CardAction>
          <Link
            href="/planning/budgets"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            View all →
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {top.map((b) => (
          <div key={b.budgetId} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: b.categoryColor ?? "#9ca3af" }}
                />
                <span className="truncate text-sm">{b.categoryName}</span>
              </div>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {formatPaiseWhole(b.spentPaise)} / {formatPaiseWhole(b.monthlyLimitPaise)}
              </span>
            </div>
            <BudgetProgress usedRatio={b.usedRatio} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
