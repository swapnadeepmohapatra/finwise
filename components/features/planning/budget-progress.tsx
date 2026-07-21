import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** Budget usage bar: primary <80%, amber ≥80%, red ≥100%. */
export function BudgetProgress({
  usedRatio,
  className,
}: {
  usedRatio: number;
  className?: string;
}) {
  return (
    <Progress
      value={Math.min(100, Math.round(usedRatio * 100))}
      className={cn(
        usedRatio >= 1
          ? "[&_[data-slot=progress-indicator]]:bg-red-500"
          : usedRatio >= 0.8
            ? "[&_[data-slot=progress-indicator]]:bg-amber-500"
            : undefined,
        className,
      )}
    />
  );
}
