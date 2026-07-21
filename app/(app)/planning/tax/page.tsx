import {
  computeTax,
  NEW_REGIME,
  OLD_REGIME,
  type TaxComputation,
} from "@/lib/finance/tax";
import { getTaxProfile } from "@/lib/finance/tax-data";
import { formatPaise, formatPaiseWhole } from "@/lib/utils/money";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="pt-1 font-mono text-lg tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function RegimeRow({ name, result }: { name: string; result: TaxComputation }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{name}</TableCell>
      <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
        {formatPaise(result.grossPaise)}
      </TableCell>
      <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">
        {formatPaise(result.deductionsAppliedPaise)}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums">
        {formatPaise(result.taxablePaise)}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums">
        {formatPaise(result.totalPaise)}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums">
        {result.effectiveRatePct.toFixed(1)}%
      </TableCell>
    </TableRow>
  );
}

export default async function TaxPage() {
  const profile = await getTaxProfile();
  const { fy, salary, sec80c, sec80d } = profile;

  if (salary.entryCount === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Tax planner</h2>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Add salary entries or upload payslips to see tax estimates.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Regime comparison on projected annual gross; §80C/§80D actuals apply
  // to the old regime only (computeTax enforces regime caps itself).
  const oldTax = computeTax("old", salary.projectedAnnualGrossPaise, {
    sec80cPaise: sec80c.totalPaise,
    sec80dPaise: sec80d.detectedPremiumsPaise,
  });
  const newTax = computeTax("new", salary.projectedAnnualGrossPaise);
  const savingsPaise = Math.abs(oldTax.totalPaise - newTax.totalPaise);
  const betterRegime =
    newTax.totalPaise <= oldTax.totalPaise ? NEW_REGIME.label : OLD_REGIME.label;

  const usedPct =
    sec80c.capPaise > 0 ? (sec80c.cappedPaise / sec80c.capPaise) * 100 : 0;
  const breakdown = [
    { label: "Employee PF (EPF)", amountPaise: sec80c.epfPaise },
    { label: "ELSS SIPs", amountPaise: sec80c.elssPaise },
    { label: "Life-insurance premiums", amountPaise: sec80c.insurancePremiumsPaise },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Tax planner</h2>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Projected annual gross"
          value={formatPaise(salary.projectedAnnualGrossPaise)}
        />
        <StatCard
          label={`TDS paid so far (${fy.label})`}
          value={formatPaise(salary.actualTdsPaise)}
        />
        <StatCard label="Current financial year" value={fy.label} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Section 80C utilization</h3>
            <p className="text-sm text-muted-foreground">
              {formatPaiseWhole(sec80c.cappedPaise)} of{" "}
              {formatPaiseWhole(sec80c.capPaise)} used ·{" "}
              {formatPaiseWhole(sec80c.headroomPaise)} headroom
            </p>
          </div>
          <Progress value={usedPct} />
          <div className="flex flex-col divide-y">
            {breakdown.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-mono tabular-nums">
                  {formatPaise(row.amountPaise)}
                </span>
              </div>
            ))}
          </div>
          {sec80c.headroomPaise > 0 ? (
            <p className="text-sm text-muted-foreground">
              You still have {formatPaiseWhole(sec80c.headroomPaise)} of 80C
              headroom this FY — investing it in ELSS or PPF before 31 Mar
              would lower your old-regime taxable income.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your 80C limit is fully used for this FY.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between p-4 text-sm">
          <span className="text-muted-foreground">
            Section 80D — {sec80d.note}
          </span>
          <span className="font-mono tabular-nums">
            {formatPaise(sec80d.detectedPremiumsPaise)}
            <span className="text-muted-foreground">
              {" "}
              (counted: {formatPaiseWhole(sec80d.cappedPaise)}, cap{" "}
              {formatPaiseWhole(sec80d.capPaise)})
            </span>
          </span>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">Regime comparison</h3>
        <Card className="py-0">
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Regime</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    Gross
                  </TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    Deductions
                  </TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">Tax + cess</TableHead>
                  <TableHead className="text-right">Effective rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <RegimeRow name={OLD_REGIME.label} result={oldTax} />
                <RegimeRow name={NEW_REGIME.label} result={newTax} />
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-sm">
            {savingsPaise > 0 ? (
              <p>
                You save{" "}
                <span className="font-mono tabular-nums text-emerald-500">
                  {formatPaise(savingsPaise)}
                </span>{" "}
                with the {betterRegime.toLowerCase()}.
              </p>
            ) : (
              <p>Both regimes result in the same tax for this projection.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Estimates use FY 2025-26 slab rules with salaried assumptions
        (standard deduction applied; no surcharge, marginal relief, HRA or
        other exemptions). Projections extrapolate your recorded salary
        months. This is not tax advice. Slab rates and deduction caps are
        editable in lib/finance/tax.ts.
      </p>
    </div>
  );
}
