"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MonthlyCashflow } from "@/lib/db/queries";
import { formatPaise, formatPaiseCompact } from "@/lib/utils/money";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-07" → "Jul" */
function monthTick(month: string): string {
  const m = Number(month.slice(5, 7));
  return MONTH_LABELS[m - 1] ?? month;
}

/** "2026-07" → "Jul 2026" */
function monthLabel(month: string): string {
  return `${monthTick(month)} ${month.slice(0, 4)}`;
}

// Series colors are fixed per entity (never re-assigned by rank). The trio
// chart-1 / chart-2 / chart-4 was validated with the dataviz palette script:
// adjacent-pair CVD ΔE 18.4 and normal-vision ΔE 18.4 on the dark card surface.
const chartConfig = {
  incomePaise: { label: "Income", color: "var(--chart-1)" },
  expensePaise: { label: "Expense", color: "var(--chart-2)" },
  investedPaise: { label: "Invested", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function CashflowChart({ data }: { data: MonthlyCashflow[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={monthTick}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(value: number) => formatPaiseCompact(value)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const month = payload?.[0]?.payload?.month;
                return typeof month === "string" ? monthLabel(month) : null;
              }}
              formatter={(value, name) => (
                <>
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: `var(--color-${name})` }}
                  />
                  <div className="flex flex-1 items-center justify-between gap-3 leading-none">
                    <span className="text-muted-foreground">
                      {chartConfig[name as keyof typeof chartConfig]?.label ?? name}
                    </span>
                    <span className="font-mono font-medium text-foreground tabular-nums">
                      {formatPaise(Number(value))}
                    </span>
                  </div>
                </>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="incomePaise"
          fill="var(--color-incomePaise)"
          radius={[4, 4, 0, 0]}
          maxBarSize={16}
        />
        <Bar
          dataKey="expensePaise"
          fill="var(--color-expensePaise)"
          radius={[4, 4, 0, 0]}
          maxBarSize={16}
        />
        <Bar
          dataKey="investedPaise"
          fill="var(--color-investedPaise)"
          radius={[4, 4, 0, 0]}
          maxBarSize={16}
        />
      </BarChart>
    </ChartContainer>
  );
}
