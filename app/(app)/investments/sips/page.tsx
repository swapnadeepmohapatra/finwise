import { Plus } from "lucide-react";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accounts, mfHoldings, sipInstallments, sips } from "@/lib/db/schema";
import { formatPaise } from "@/lib/utils/money";
import { daysUntil, formatDate } from "@/lib/utils/dates";
import { GenerateInstallmentsButton } from "@/components/features/investments/generate-installments-button";
import { InstallmentActions } from "@/components/features/investments/installment-actions";
import { SipDialog } from "@/components/features/investments/sip-dialog";
import { SipMenu } from "@/components/features/investments/sip-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const FREQUENCY_LABELS = {
  monthly: "Monthly",
  weekly: "Weekly",
  quarterly: "Quarterly",
} as const;

function DueBadge({ dueDate }: { dueDate: string }) {
  const days = daysUntil(dueDate);
  if (days < 0)
    return <Badge className="bg-red-500/15 text-red-500">Overdue</Badge>;
  if (days === 0) return <Badge>Today</Badge>;
  return <Badge variant="outline">in {days}d</Badge>;
}

export default async function SipsPage() {
  const db = getDb();
  const [sipRows, mfRows, bankRows, upcomingRows, paidRows] = await Promise.all([
    db.select().from(sips).orderBy(asc(sips.createdAt)),
    db.select().from(mfHoldings).orderBy(asc(mfHoldings.schemeName)),
    db
      .select()
      .from(accounts)
      .where(and(eq(accounts.type, "bank"), eq(accounts.isActive, true)))
      .orderBy(asc(accounts.name)),
    db.query.sipInstallments.findMany({
      where: eq(sipInstallments.status, "upcoming"),
      with: { sip: true },
      orderBy: [asc(sipInstallments.dueDate)],
    }),
    db.query.sipInstallments.findMany({
      where: eq(sipInstallments.status, "paid"),
      with: { sip: true },
      orderBy: [desc(sipInstallments.dueDate)],
      limit: 5,
    }),
  ]);

  const mfOptions = mfRows.map((h) => ({ id: h.id, schemeName: h.schemeName }));
  const bankAccounts = bankRows.map((a) => ({ id: a.id, name: a.name }));
  const upcoming = upcomingRows.filter((i) => daysUntil(i.dueDate) <= 60);

  const monthlyTotal = sipRows
    .filter((s) => s.isActive && s.frequency === "monthly")
    .reduce((sum, s) => sum + s.amountPaise, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">SIPs</h2>
        <div className="flex items-center gap-2">
          <GenerateInstallmentsButton />
          <SipDialog
            mfOptions={mfOptions}
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4" /> Add SIP
              </Button>
            }
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Monthly SIP total</p>
            <p className="pt-1 font-mono text-lg tabular-nums">
              {formatPaise(monthlyTotal)}
            </p>
            <p className="text-xs text-muted-foreground">Active monthly SIPs</p>
          </CardContent>
        </Card>
      </div>

      {sipRows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No SIPs yet. Add your first SIP to track recurring investments.
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="hidden sm:table-cell">Frequency</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Day</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sipRows.map((s) => (
                  <TableRow key={s.id} className={s.isActive ? "" : "opacity-60"}>
                    <TableCell className="max-w-48 md:max-w-72">
                      <p className="truncate font-medium">{s.name}</p>
                      {s.schemeName ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {s.schemeName}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatPaise(s.amountPaise)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {FREQUENCY_LABELS[s.frequency]}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
                      {s.dayOfMonth}
                    </TableCell>
                    <TableCell>
                      {s.isActive ? (
                        <Badge className="bg-emerald-500/15 text-emerald-500">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline">Paused</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <SipMenu sip={s} mfOptions={mfOptions} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Upcoming installments (next 60 days)
        </h2>
        {upcoming.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Nothing due in the next 60 days. Use “Generate upcoming
              installments” to create them from your active SIPs.
            </CardContent>
          </Card>
        ) : (
          <Card className="py-0">
            <CardContent className="divide-y p-0">
              {upcoming.map((i) => (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{i.sip.name}</p>
                      <DueBadge dueDate={i.dueDate} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Due {formatDate(i.dueDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono tabular-nums">
                      {formatPaise(i.amountPaise)}
                    </span>
                    <InstallmentActions
                      installment={{
                        id: i.id,
                        dueDate: i.dueDate,
                        amountPaise: i.amountPaise,
                        sipName: i.sip.name,
                        linkedToHolding: i.sip.mfHoldingId != null,
                      }}
                      bankAccounts={bankAccounts}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Recently paid</h2>
        {paidRows.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No paid installments yet.
            </CardContent>
          </Card>
        ) : (
          <Card className="py-0">
            <CardContent className="divide-y p-0">
              {paidRows.map((i) => (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{i.sip.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(i.dueDate)}
                      {i.units != null ? ` · ${Number(i.units)} units` : ""}
                      {i.nav != null ? ` @ ${Number(i.nav)}` : ""}
                    </p>
                  </div>
                  <span className="font-mono tabular-nums">
                    {formatPaise(i.amountPaise)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
