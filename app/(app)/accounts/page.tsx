import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accounts, type Account } from "@/lib/db/schema";
import { formatPaise } from "@/lib/utils/money";
import { AccountDialog } from "@/components/features/accounts/account-dialog";
import { AccountMenu } from "@/components/features/accounts/account-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Accounts" };
export const dynamic = "force-dynamic";

const GROUPS: { type: Account["type"]; title: string }[] = [
  { type: "bank", title: "Bank accounts" },
  { type: "credit_card", title: "Credit cards" },
  { type: "demat", title: "Demat" },
  { type: "wallet", title: "Wallets" },
  { type: "cash", title: "Cash" },
];

export default async function AccountsPage() {
  const rows = await getDb().select().from(accounts).orderBy(asc(accounts.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <AccountDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" /> Add account
            </Button>
          }
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No accounts yet. Add your first bank account, credit card, or wallet.
          </CardContent>
        </Card>
      ) : null}

      {GROUPS.map(({ type, title }) => {
        const group = rows.filter((a) => a.type === type);
        if (group.length === 0) return null;
        return (
          <section key={type} className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((account) => (
                <Card key={account.id} className={account.isActive ? "" : "opacity-60"}>
                  <CardContent className="flex items-start justify-between gap-2 p-4">
                    <Link href={`/accounts/${account.id}`} className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{account.name}</p>
                        {!account.isActive ? (
                          <Badge variant="outline">Inactive</Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {[account.institution, account.last4 && `•••• ${account.last4}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="pt-2 font-mono text-lg tabular-nums">
                        {account.type === "credit_card"
                          ? account.creditLimitPaise != null
                            ? `${formatPaise(account.creditLimitPaise)} limit`
                            : "—"
                          : account.currentBalancePaise != null
                            ? formatPaise(account.currentBalancePaise)
                            : "—"}
                      </p>
                    </Link>
                    <AccountMenu account={account} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
