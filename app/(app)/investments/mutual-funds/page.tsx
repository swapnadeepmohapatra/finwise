import { Plus } from "lucide-react";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { mfHoldings, sipInstallments, sips, type MfHolding } from "@/lib/db/schema";
import { xirr, type CashFlow } from "@/lib/finance/xirr";
import { formatPaise } from "@/lib/utils/money";
import { todayIST } from "@/lib/utils/dates";
import { MfDialog } from "@/components/features/investments/mf-dialog";
import { MfMenu } from "@/components/features/investments/mf-menu";
import { RefreshNavsButton } from "@/components/features/investments/refresh-navs-button";
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

const KIND_LABELS: Record<MfHolding["holdingKind"], string> = {
  equity: "Equity",
  debt: "Debt",
  hybrid: "Hybrid",
  elss: "ELSS",
  index: "Index",
  liquid: "Liquid",
  other: "Other",
};

function formatUnits(value: string, digits = 4): string {
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: digits });
}

function Pnl({ pnlPaise, pct }: { pnlPaise: number; pct?: number }) {
  const color = pnlPaise >= 0 ? "text-emerald-500" : "text-red-500";
  return (
    <span className={`font-mono tabular-nums ${color}`}>
      {pnlPaise >= 0 ? "+" : ""}
      {formatPaise(pnlPaise)}
      {pct !== undefined ? ` (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)` : ""}
    </span>
  );
}

/** Annualized return as "+14.2%" / "−3.1%"; em dash when not computable. */
function Xirr({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const color = value >= 0 ? "text-emerald-500" : "text-red-500";
  return (
    <span className={`font-mono tabular-nums ${color}`}>
      {value >= 0 ? "+" : "−"}
      {Math.abs(value * 100).toFixed(1)}%
    </span>
  );
}

export default async function MutualFundsPage() {
  const db = getDb();
  const [holdings, paidInstallments] = await Promise.all([
    db.select().from(mfHoldings).orderBy(asc(mfHoldings.schemeName)),
    // Paid SIP installments of SIPs linked to an MF holding → XIRR cash flows.
    db
      .select({
        mfHoldingId: sips.mfHoldingId,
        dueDate: sipInstallments.dueDate,
        amountPaise: sipInstallments.amountPaise,
      })
      .from(sipInstallments)
      .innerJoin(sips, eq(sipInstallments.sipId, sips.id))
      .where(
        and(eq(sipInstallments.status, "paid"), isNotNull(sips.mfHoldingId)),
      ),
  ]);

  const invested = holdings.reduce((sum, h) => sum + h.investedPaise, 0);
  // Holdings without a NAV count at cost so totals stay comparable.
  const current = holdings.reduce(
    (sum, h) => sum + (h.currentValuePaise ?? h.investedPaise),
    0,
  );
  const pnl = current - invested;
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

  const today = todayIST();
  const flowsByHolding = new Map<string, CashFlow[]>();
  for (const inst of paidInstallments) {
    if (!inst.mfHoldingId) continue;
    const flows = flowsByHolding.get(inst.mfHoldingId) ?? [];
    flows.push({ date: inst.dueDate, amountPaise: -inst.amountPaise });
    flowsByHolding.set(inst.mfHoldingId, flows);
  }

  // Purchases as outflows + today's value as the inflow. When the dated
  // installments only cover part of what was invested (units bought before
  // Finwise tracking), value only the covered share so the rate isn't
  // distorted by capital with no dated history.
  const holdingXirrFlows = (h: MfHolding): CashFlow[] | null => {
    const flows = flowsByHolding.get(h.id);
    if (!flows) return null;
    const instSum = flows.reduce((s, f) => s - f.amountPaise, 0);
    if (instSum <= 0 || h.investedPaise <= 0) return null;
    const value = h.currentValuePaise ?? h.investedPaise;
    const coveredValue =
      instSum >= h.investedPaise * 0.95
        ? value
        : Math.round(value * (instSum / h.investedPaise));
    return [...flows, { date: today, amountPaise: coveredValue }];
  };

  const holdingXirr = (h: MfHolding): number | null => {
    const flows = holdingXirrFlows(h);
    return flows ? xirr(flows) : null;
  };

  const portfolioFlows = holdings.flatMap((h) => holdingXirrFlows(h) ?? []);
  const portfolioXirr = portfolioFlows.length > 0 ? xirr(portfolioFlows) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Mutual funds</h2>
        <div className="flex items-center gap-2">
          <RefreshNavsButton />
          <MfDialog
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4" /> Add holding
              </Button>
            }
          />
        </div>
      </div>

      <div
        className={
          portfolioXirr !== null
            ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            : "grid gap-3 sm:grid-cols-3"
        }
      >
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Invested</p>
            <p className="pt-1 font-mono text-lg tabular-nums">
              {formatPaise(invested)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Current</p>
            <p className="pt-1 font-mono text-lg tabular-nums">
              {formatPaise(current)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">P&amp;L</p>
            <p className="pt-1 text-lg">
              <Pnl pnlPaise={pnl} pct={pnlPct} />
            </p>
          </CardContent>
        </Card>
        {portfolioXirr !== null ? (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">XIRR</p>
              <p className="pt-1 text-lg">
                <Xirr value={portfolioXirr} />
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {holdings.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No mutual fund holdings yet. Add your first scheme.
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scheme</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    Units
                  </TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    Avg NAV
                  </TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    Invested
                  </TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">P&amp;L</TableHead>
                  <TableHead className="text-right">XIRR</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="max-w-48 md:max-w-72">
                      <p className="truncate font-medium">{h.schemeName}</p>
                      {h.amc ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {h.amc}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{KIND_LABELS[h.holdingKind]}</Badge>
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">
                      {formatUnits(h.units)}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums lg:table-cell">
                      {h.avgNav != null ? formatUnits(h.avgNav, 2) : "—"}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
                      {formatPaise(h.investedPaise)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {h.currentValuePaise != null
                        ? formatPaise(h.currentValuePaise)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {h.currentValuePaise != null ? (
                        <Pnl pnlPaise={h.currentValuePaise - h.investedPaise} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Xirr value={holdingXirr(h)} />
                    </TableCell>
                    <TableCell>
                      <MfMenu holding={h} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
