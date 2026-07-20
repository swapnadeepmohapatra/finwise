import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { formatPaise } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/dates";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const account = await db.query.accounts.findFirst({
    where: (a, { eq: eqOp }) => eqOp(a.id, id),
  });
  if (!account) notFound();

  const txns = await db.query.transactions.findMany({
    where: eq(transactions.accountId, id),
    with: { category: true },
    orderBy: [desc(transactions.date), desc(transactions.createdAt)],
    limit: 50,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/accounts"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Accounts
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
          {account.currentBalancePaise != null ? (
            <p className="font-mono text-2xl tabular-nums">
              {formatPaise(account.currentBalancePaise)}
            </p>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {[account.institution, account.last4 && `•••• ${account.last4}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent transactions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {txns.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No transactions on this account yet.
            </p>
          ) : (
            txns.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(t.date)}
                    {t.category ? (
                      <Badge variant="secondary" className="ml-2">
                        {t.category.name}
                      </Badge>
                    ) : null}
                  </p>
                </div>
                <p
                  className={`shrink-0 font-mono text-sm tabular-nums ${
                    t.type === "income"
                      ? "text-emerald-500"
                      : t.type === "transfer"
                        ? "text-muted-foreground"
                        : ""
                  }`}
                >
                  {t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}
                  {formatPaise(t.amountPaise)}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
