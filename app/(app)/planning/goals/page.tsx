import { Plus } from "lucide-react";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { goals } from "@/lib/db/schema";
import { getMonthlyCashflow } from "@/lib/db/queries";
import { addMonths, formatDate, formatMonth, monthStart } from "@/lib/utils/dates";
import { formatPaiseWhole } from "@/lib/utils/money";
import { cn } from "@/lib/utils";
import {
  AddMoneyDialog,
  GoalMenu,
} from "@/components/features/planning/goal-actions";
import { GoalDialog, type GoalData } from "@/components/features/planning/goal-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const dynamic = "force-dynamic";

type Projection = { text: string; tone: "ok" | "risk" | "muted" };

const TONE_CLASSES: Record<Projection["tone"], string> = {
  ok: "text-emerald-500",
  risk: "text-amber-500",
  muted: "text-muted-foreground",
};

function projectGoal(goal: GoalData, avgMonthlySavingsPaise: number): Projection {
  const remainingPaise = goal.targetPaise - goal.savedPaise;
  if (remainingPaise <= 0) return { text: "Goal reached", tone: "ok" };
  if (avgMonthlySavingsPaise <= 0)
    return { text: "No recent savings to project a finish date", tone: "muted" };

  const monthsNeeded = Math.ceil(remainingPaise / avgMonthlySavingsPaise);
  const projectedMonth = addMonths(monthStart(), monthsNeeded);
  if (goal.targetDate && projectedMonth > monthStart(goal.targetDate)) {
    return {
      text: `At this rate you'd need ${monthsNeeded} months — target date at risk`,
      tone: "risk",
    };
  }
  return { text: `On track for ${formatMonth(projectedMonth)}`, tone: "ok" };
}

export default async function GoalsPage() {
  const [goalRows, cashflow] = await Promise.all([
    getDb().select().from(goals).orderBy(asc(goals.createdAt)),
    getMonthlyCashflow(6),
  ]);

  // Average savings across the last 6 months, ignoring months with no activity.
  const activeMonths = cashflow.filter(
    (m) => m.incomePaise > 0 || m.expensePaise > 0,
  );
  const avgMonthlySavingsPaise =
    activeMonths.length > 0
      ? Math.round(
          activeMonths.reduce((sum, m) => sum + m.incomePaise - m.expensePaise, 0) /
            activeMonths.length,
        )
      : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Goals</h2>
          {avgMonthlySavingsPaise > 0 ? (
            <p className="text-sm text-muted-foreground">
              Saving about{" "}
              <span className="font-mono tabular-nums">
                {formatPaiseWhole(avgMonthlySavingsPaise)}
              </span>
              /month over the last 6 months
            </p>
          ) : null}
        </div>
        <GoalDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" /> New goal
            </Button>
          }
        />
      </div>

      {goalRows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No goals yet. Create one to start tracking progress towards it.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {goalRows.map((g) => {
            const goal: GoalData = {
              id: g.id,
              name: g.name,
              targetPaise: g.targetPaise,
              savedPaise: g.savedPaise,
              targetDate: g.targetDate,
              notes: g.notes,
            };
            const ratio = g.targetPaise > 0 ? g.savedPaise / g.targetPaise : 0;
            const projection = projectGoal(goal, avgMonthlySavingsPaise);
            return (
              <Card key={g.id}>
                <CardHeader>
                  <CardTitle className="truncate">{g.name}</CardTitle>
                  {g.targetDate ? (
                    <CardDescription>Target · {formatDate(g.targetDate)}</CardDescription>
                  ) : null}
                  <CardAction>
                    <GoalMenu goal={goal} />
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-mono tabular-nums">
                      <span className="text-lg">{formatPaiseWhole(g.savedPaise)}</span>{" "}
                      <span className="text-sm text-muted-foreground">
                        of {formatPaiseWhole(g.targetPaise)}
                      </span>
                    </p>
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                      {Math.round(ratio * 100)}%
                    </span>
                  </div>
                  <Progress value={Math.min(100, Math.round(ratio * 100))} />
                  <p className={cn("text-xs", TONE_CLASSES[projection.tone])}>
                    {projection.text}
                  </p>
                  {g.notes ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {g.notes}
                    </p>
                  ) : null}
                  <div className="pt-2">
                    <AddMoneyDialog goal={goal} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
