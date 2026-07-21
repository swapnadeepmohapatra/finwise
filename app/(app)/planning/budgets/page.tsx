import { Plus } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { getBudgetStatus } from "@/lib/db/queries";
import { formatMonth, monthStart } from "@/lib/utils/dates";
import { formatPaiseWhole } from "@/lib/utils/money";
import { cn } from "@/lib/utils";
import { SetBudgetDialog } from "@/components/features/planning/budget-dialog";
import { BudgetMenu } from "@/components/features/planning/budget-menu";
import { BudgetProgress } from "@/components/features/planning/budget-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const [statuses, expenseCategories] = await Promise.all([
    getBudgetStatus(monthStart()),
    getDb()
      .select({ id: categories.id, name: categories.name, color: categories.color })
      .from(categories)
      .where(eq(categories.kind, "expense"))
      .orderBy(asc(categories.name)),
  ]);

  const budgetedIds = new Set(statuses.map((s) => s.categoryId));
  const availableCategories = expenseCategories.filter((c) => !budgetedIds.has(c.id));
  const totalBudgeted = statuses.reduce((sum, b) => sum + b.monthlyLimitPaise, 0);
  const totalSpent = statuses.reduce((sum, b) => sum + b.spentPaise, 0);
  const totalRatio = totalBudgeted > 0 ? totalSpent / totalBudgeted : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Monthly budgets</h2>
          <p className="text-sm text-muted-foreground">{formatMonth(monthStart())}</p>
        </div>
        <SetBudgetDialog
          availableCategories={availableCategories}
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" /> Set budget
            </Button>
          }
        />
      </div>

      {statuses.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No budgets yet. Set a monthly limit for an expense category to track
            your spending against it.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-muted-foreground">Spent this month</p>
                <p className="font-mono text-sm tabular-nums">
                  {formatPaiseWhole(totalSpent)}{" "}
                  <span className="text-muted-foreground">
                    of {formatPaiseWhole(totalBudgeted)} budgeted
                  </span>
                </p>
              </div>
              <BudgetProgress usedRatio={totalRatio} />
            </CardContent>
          </Card>

          <Card className="py-0">
            <CardContent className="divide-y p-0">
              {statuses.map((b) => {
                const overPaise = b.spentPaise - b.monthlyLimitPaise;
                return (
                  <div key={b.budgetId} className="flex flex-col gap-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: b.categoryColor ?? "#9ca3af" }}
                        />
                        <span className="truncate font-medium">{b.categoryName}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="font-mono text-sm tabular-nums text-muted-foreground">
                          <span className="text-foreground">
                            {formatPaiseWhole(b.spentPaise)}
                          </span>{" "}
                          of {formatPaiseWhole(b.monthlyLimitPaise)}
                        </span>
                        <BudgetMenu
                          budget={{
                            budgetId: b.budgetId,
                            categoryId: b.categoryId,
                            categoryName: b.categoryName,
                            monthlyLimitPaise: b.monthlyLimitPaise,
                          }}
                        />
                      </div>
                    </div>
                    <BudgetProgress usedRatio={b.usedRatio} />
                    <p
                      className={cn(
                        "text-xs",
                        overPaise > 0
                          ? "text-red-500"
                          : b.usedRatio >= 0.8
                            ? "text-amber-500"
                            : "text-muted-foreground",
                      )}
                    >
                      {overPaise > 0
                        ? `Over by ${formatPaiseWhole(overPaise)}`
                        : `${formatPaiseWhole(-overPaise)} left to spend`}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
