import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { getDb } from "@/lib/db";
import { formatPaise } from "@/lib/utils/money";
import { addMonths, monthStart } from "@/lib/utils/dates";
import { SalaryDialog } from "@/components/features/income/salary-dialog";
import { SalaryList } from "@/components/features/income/salary-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Income" };
export const dynamic = "force-dynamic";

export default async function IncomePage() {
  const db = getDb();
  const [entries, bankAccounts] = await Promise.all([
    db.query.salaryEntries.findMany({
      with: { creditedAccount: true },
      orderBy: (t, { desc }) => [desc(t.month)],
    }),
    db.query.accounts.findMany({
      where: (t, { eq }) => eq(t.type, "bank"),
      orderBy: (t, { asc }) => [asc(t.name)],
    }),
  ]);

  const accountOptions = bankAccounts.map((a) => ({ id: a.id, name: a.name }));

  // Last 12 months (current month included), computed from the fetched rows.
  const windowStart = addMonths(monthStart(), -11);
  const recent = entries.filter((e) => e.month >= windowStart);
  const grossTotal = recent.reduce((sum, e) => sum + e.grossPaise, 0);
  const netTotal = recent.reduce((sum, e) => sum + e.netPaise, 0);
  const avgNet = recent.length > 0 ? Math.round(netTotal / recent.length) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Income</h1>
        <SalaryDialog
          accounts={accountOptions}
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" /> Add entry
            </Button>
          }
        />
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No salary entries yet. Add your first month&apos;s salary to start
            tracking income.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Last 12 months</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Gross</p>
                <p className="font-mono text-xl tabular-nums">
                  {formatPaise(grossTotal)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Net</p>
                <p className="font-mono text-xl tabular-nums">
                  {formatPaise(netTotal)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg net / month</p>
                <p className="font-mono text-xl tabular-nums">
                  {formatPaise(avgNet)}
                </p>
              </div>
            </CardContent>
          </Card>

          <SalaryList entries={entries} accounts={accountOptions} />
        </>
      )}
    </div>
  );
}
