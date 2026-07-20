import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accounts, creditCardBills, type CreditCardBill } from "@/lib/db/schema";
import { formatPaise } from "@/lib/utils/money";
import { daysUntil, formatDate } from "@/lib/utils/dates";
import { BillDialog } from "@/components/features/credit-cards/bill-dialog";
import { BillMenu } from "@/components/features/credit-cards/bill-menu";
import { PayDialog } from "@/components/features/credit-cards/pay-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Credit cards" };
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<
  CreditCardBill["status"],
  { label: string; variant: "destructive" | "outline" | "secondary" }
> = {
  unpaid: { label: "Unpaid", variant: "destructive" },
  partially_paid: { label: "Partially paid", variant: "outline" },
  paid: { label: "Paid", variant: "secondary" },
};

function DueCountdown({ dueDate }: { dueDate: string }) {
  const days = daysUntil(dueDate);
  const label =
    days < 0
      ? `overdue by ${-days} ${-days === 1 ? "day" : "days"}`
      : days === 0
        ? "due today"
        : `due in ${days} ${days === 1 ? "day" : "days"}`;
  const tone =
    days < 3
      ? "text-red-600 dark:text-red-400"
      : days < 7
        ? "text-amber-600 dark:text-amber-500"
        : "text-muted-foreground";
  return (
    <span className={tone}>
      {formatDate(dueDate)} · {label}
    </span>
  );
}

export default async function CreditCardsPage() {
  const db = getDb();
  const [cards, bills, bankAccounts] = await Promise.all([
    db
      .select()
      .from(accounts)
      .where(eq(accounts.type, "credit_card"))
      .orderBy(asc(accounts.createdAt)),
    db.query.creditCardBills.findMany({
      with: { account: true },
      orderBy: [desc(creditCardBills.statementDate)],
    }),
    db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(and(eq(accounts.type, "bank"), eq(accounts.isActive, true)))
      .orderBy(asc(accounts.createdAt)),
  ]);

  const cardOptions = cards.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Credit cards</h1>
        {cards.length > 0 ? (
          <BillDialog
            cards={cardOptions}
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4" /> Add bill
              </Button>
            }
          />
        ) : null}
      </div>

      {cards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-muted-foreground">
              No credit cards yet. Add a credit card account to start tracking
              bills.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/accounts">Add a credit card</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {cards.map((card) => {
        const cardBills = bills.filter((b) => b.accountId === card.id);
        const current = cardBills.find((b) => b.status !== "paid");
        const history = cardBills.filter((b) => b.id !== current?.id);

        return (
          <Card key={card.id}>
            <CardHeader>
              <CardTitle>{card.name}</CardTitle>
              <CardDescription>
                {[card.institution, card.last4 && `•••• ${card.last4}`]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </CardDescription>
              <CardAction className="text-right">
                <p className="font-mono text-sm tabular-nums">
                  {card.creditLimitPaise != null
                    ? `${formatPaise(card.creditLimitPaise)} limit`
                    : "—"}
                </p>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {current ? (
                <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border bg-muted/50 p-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Current bill
                      </p>
                      <Badge variant={STATUS_BADGE[current.status].variant}>
                        {STATUS_BADGE[current.status].label}
                      </Badge>
                    </div>
                    <p className="font-mono text-2xl tabular-nums">
                      {formatPaise(current.totalDuePaise)}
                    </p>
                    <div className="flex flex-col gap-0.5 text-sm">
                      {current.minDuePaise != null ? (
                        <span className="text-muted-foreground">
                          Min due{" "}
                          <span className="font-mono tabular-nums">
                            {formatPaise(current.minDuePaise)}
                          </span>
                        </span>
                      ) : null}
                      {current.paidPaise > 0 ? (
                        <span className="text-muted-foreground">
                          Paid so far{" "}
                          <span className="font-mono tabular-nums">
                            {formatPaise(current.paidPaise)}
                          </span>
                        </span>
                      ) : null}
                      <DueCountdown dueDate={current.dueDate} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <PayDialog
                      bill={current}
                      cardName={card.name}
                      bankAccounts={bankAccounts}
                      trigger={<Button size="sm">Pay</Button>}
                    />
                    <BillMenu bill={current} cards={cardOptions} />
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
                  No dues 🎉
                </div>
              )}

              {history.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Statement</TableHead>
                      <TableHead>Due date</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((bill) => (
                      <TableRow key={bill.id}>
                        <TableCell>{formatDate(bill.statementDate)}</TableCell>
                        <TableCell>{formatDate(bill.dueDate)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatPaise(bill.totalDuePaise)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatPaise(bill.paidPaise)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[bill.status].variant}>
                            {STATUS_BADGE[bill.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <BillMenu bill={bill} cards={cardOptions} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
