import { Plus } from "lucide-react";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assets, loans, type Loan } from "@/lib/db/schema";
import { outstandingPaise, remainingMonths } from "@/lib/finance/loan";
import { formatPaise } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/dates";
import {
  ASSET_KINDS,
  ASSET_KIND_LABELS,
} from "@/components/features/planning/asset-kinds";
import { AssetDialog } from "@/components/features/planning/asset-dialog";
import { AssetMenu } from "@/components/features/planning/asset-menu";
import { LoanDialog } from "@/components/features/planning/loan-dialog";
import { LoanMenu } from "@/components/features/planning/loan-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function LoanCard({ loan }: { loan: Loan }) {
  const outstanding = outstandingPaise(loan);
  const repaidFraction =
    loan.principalPaise > 0
      ? Math.min(1, Math.max(0, (loan.principalPaise - outstanding) / loan.principalPaise))
      : 0;
  const monthsLeft = remainingMonths(loan);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">{loan.name}</p>
              {!loan.isActive ? <Badge variant="secondary">Paused</Badge> : null}
            </div>
            {loan.lender ? (
              <p className="truncate text-xs text-muted-foreground">{loan.lender}</p>
            ) : null}
          </div>
          <LoanMenu loan={loan} />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="font-mono tabular-nums">{formatPaise(outstanding)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">EMI</p>
            <p className="font-mono tabular-nums">{formatPaise(loan.emiPaise)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rate</p>
            <p className="font-mono tabular-nums">{Number(loan.annualRatePct).toFixed(2)}% p.a.</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Principal</p>
            <p className="font-mono tabular-nums">{formatPaise(loan.principalPaise)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className="font-mono tabular-nums">
              {monthsLeft} {monthsLeft === 1 ? "month" : "months"}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(repaidFraction * 100).toFixed(1)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {(repaidFraction * 100).toFixed(0)}% of principal repaid
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function AssetsLoansPage() {
  const db = getDb();
  const [assetRows, loanRows] = await Promise.all([
    db.select().from(assets).orderBy(asc(assets.kind), asc(assets.name)),
    db.select().from(loans).orderBy(asc(loans.name)),
  ]);

  const totalAssetsPaise = assetRows.reduce((sum, a) => sum + a.valuePaise, 0);
  const totalOutstandingPaise = loanRows
    .filter((l) => l.isActive)
    .reduce((sum, l) => sum + outstandingPaise(l), 0);

  const groups = ASSET_KINDS.map((kind) => ({
    kind,
    items: assetRows.filter((a) => a.kind === kind),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-8">
      {/* ── Assets ─────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Other assets</h2>
          <AssetDialog
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4" /> Add asset
              </Button>
            }
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total value</p>
              <p className="pt-1 font-mono text-lg tabular-nums">
                {formatPaise(totalAssetsPaise)}
              </p>
            </CardContent>
          </Card>
        </div>

        {assetRows.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No assets yet. Add EPF, PPF, FDs, gold or property to complete your
              net worth.
            </CardContent>
          </Card>
        ) : (
          groups.map((group) => (
            <div key={group.kind} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                {ASSET_KIND_LABELS[group.kind]}
                <span className="pl-1.5 font-normal">({group.items.length})</span>
              </h3>
              <Card className="py-0">
                <CardContent className="divide-y p-0">
                  {group.items.map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{asset.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[
                            asset.institution,
                            asset.annualRatePct != null
                              ? `${Number(asset.annualRatePct).toFixed(2)}% p.a.`
                              : null,
                            asset.maturityDate
                              ? `Matures ${formatDate(asset.maturityDate)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <p className="font-mono text-sm tabular-nums">
                          {formatPaise(asset.valuePaise)}
                        </p>
                        <AssetMenu asset={asset} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          ))
        )}
      </section>

      {/* ── Loans ──────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Loans</h2>
          <LoanDialog
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4" /> Add loan
              </Button>
            }
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total outstanding</p>
              <p className="pt-1 font-mono text-lg tabular-nums">
                {formatPaise(totalOutstandingPaise)}
              </p>
            </CardContent>
          </Card>
        </div>

        {loanRows.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No loans yet. Add your home, car or personal loans to track EMIs and
              outstanding balances.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {loanRows.map((loan) => (
              <LoanCard key={loan.id} loan={loan} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
