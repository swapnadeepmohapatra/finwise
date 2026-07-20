import { Plus } from "lucide-react";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accounts, stockHoldings } from "@/lib/db/schema";
import { formatPaise } from "@/lib/utils/money";
import { RefreshNavsButton } from "@/components/features/investments/refresh-navs-button";
import { StockDialog } from "@/components/features/investments/stock-dialog";
import { StockMenu } from "@/components/features/investments/stock-menu";
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

function formatQty(value: string): string {
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
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

export default async function StocksPage() {
  const db = getDb();
  const [holdings, dematRows] = await Promise.all([
    db.select().from(stockHoldings).orderBy(asc(stockHoldings.ticker)),
    db
      .select()
      .from(accounts)
      .where(and(eq(accounts.type, "demat"), eq(accounts.isActive, true)))
      .orderBy(asc(accounts.name)),
  ]);

  const dematAccounts = dematRows.map((a) => ({ id: a.id, name: a.name }));

  const invested = holdings.reduce((sum, h) => sum + h.investedPaise, 0);
  // Holdings without a price count at cost so totals stay comparable.
  const current = holdings.reduce(
    (sum, h) => sum + (h.currentValuePaise ?? h.investedPaise),
    0,
  );
  const pnl = current - invested;
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Stocks</h2>
        <div className="flex items-center gap-2">
          <RefreshNavsButton />
          <StockDialog
            dematAccounts={dematAccounts}
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4" /> Add holding
              </Button>
            }
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
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
      </div>

      {holdings.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No stock holdings yet. Add your first stock.
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stock</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Qty</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    Avg price
                  </TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    Invested
                  </TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">P&amp;L</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="max-w-48 md:max-w-72">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{h.ticker}</p>
                        <Badge variant="outline">{h.exchange}</Badge>
                      </div>
                      {h.companyName ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {h.companyName}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">
                      {formatQty(h.quantity)}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums lg:table-cell">
                      {formatPaise(h.avgPricePaise)}
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
                    <TableCell>
                      <StockMenu holding={h} dematAccounts={dematAccounts} />
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
