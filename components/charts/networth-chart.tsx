"use client";

import { useId } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { NetWorthTrendPoint } from "@/lib/db/queries";
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

// Single series — the card title names it, so no legend box is needed.
const chartConfig = {
  balancePaise: { label: "Net worth", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function NetworthChart({ data }: { data: NetWorthTrendPoint[] }) {
  const gradientId = useId();

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-balancePaise)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-balancePaise)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
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
              formatter={(value) => (
                <>
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: "var(--color-balancePaise)" }}
                  />
                  <div className="flex flex-1 items-center justify-between gap-3 leading-none">
                    <span className="text-muted-foreground">Net worth</span>
                    <span className="font-mono font-medium text-foreground tabular-nums">
                      {formatPaise(Number(value))}
                    </span>
                  </div>
                </>
              )}
            />
          }
        />
        <Area
          dataKey="balancePaise"
          type="monotone"
          stroke="var(--color-balancePaise)"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
