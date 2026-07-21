"use client";

import { Cell, Label, Pie, PieChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { CategorySpend } from "@/lib/db/queries";
import { formatPaise, formatPaiseCompact } from "@/lib/utils/money";

const TOP_SLICES = 6;

// Fallback fills (used only when a category has no stored color), assigned in
// fixed rank order — never cycled. Slices are value-sorted, so position also
// encodes rank; the legend list with amounts carries identity, never color alone.
const FALLBACK_FILLS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--muted-foreground)",
];

const OTHER_FILL = "var(--chart-5)";

type Slice = { name: string; totalPaise: number; fill: string };

function buildSlices(data: CategorySpend[]): Slice[] {
  const sorted = [...data].sort((a, b) => b.totalPaise - a.totalPaise);
  const top = sorted.slice(0, TOP_SLICES).map((c, i) => ({
    name: c.categoryName,
    totalPaise: c.totalPaise,
    fill: c.categoryColor ?? FALLBACK_FILLS[i],
  }));
  const rest = sorted.slice(TOP_SLICES);
  if (rest.length > 0) {
    top.push({
      name: "Other",
      totalPaise: rest.reduce((sum, c) => sum + c.totalPaise, 0),
      fill: OTHER_FILL,
    });
  }
  return top.filter((s) => s.totalPaise > 0);
}

export function CategoryDonut({ data }: { data: CategorySpend[] }) {
  const slices = buildSlices(data);
  const totalPaise = slices.reduce((sum, s) => sum + s.totalPaise, 0);

  if (totalPaise === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No spending recorded this month.
      </div>
    );
  }

  const chartConfig = Object.fromEntries(
    slices.map((s) => [s.name, { label: s.name, color: s.fill }]),
  ) satisfies ChartConfig;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <ChartContainer
        config={chartConfig}
        className="aspect-square h-48 w-48 shrink-0"
      >
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, name, item) => (
                  <>
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: item?.payload?.fill }}
                    />
                    <div className="flex flex-1 items-center justify-between gap-3 leading-none">
                      <span className="text-muted-foreground">{name}</span>
                      <span className="font-mono font-medium text-foreground tabular-nums">
                        {formatPaise(Number(value))}
                      </span>
                    </div>
                  </>
                )}
              />
            }
          />
          <Pie
            data={slices}
            dataKey="totalPaise"
            nameKey="name"
            innerRadius={56}
            outerRadius={82}
            stroke="var(--card)"
            strokeWidth={2}
          >
            {slices.map((s) => (
              <Cell key={s.name} fill={s.fill} />
            ))}
            <Label
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  const cx = viewBox.cx ?? 0;
                  const cy = viewBox.cy ?? 0;
                  return (
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan
                        x={cx}
                        y={cy}
                        className="fill-foreground font-mono text-base font-semibold tabular-nums"
                      >
                        {formatPaiseCompact(totalPaise)}
                      </tspan>
                      <tspan x={cx} y={cy + 18} className="fill-muted-foreground text-xs">
                        spent
                      </tspan>
                    </text>
                  );
                }
                return null;
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>

      <ul className="flex w-full min-w-0 flex-col gap-2 text-sm">
        {slices.map((s) => (
          <li key={s.name} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-[2px] ring-1 ring-foreground/20"
              style={{ backgroundColor: s.fill }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {s.name}
            </span>
            <span className="font-mono tabular-nums">{formatPaise(s.totalPaise)}</span>
            <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
              {Math.round((s.totalPaise / totalPaise) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
