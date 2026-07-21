"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/planning/budgets", label: "Budgets" },
  { href: "/planning/goals", label: "Goals" },
  { href: "/planning/assets", label: "Assets & Loans" },
  { href: "/planning/tax", label: "Tax" },
];

export function PlanningTabs() {
  const pathname = usePathname();
  return (
    <div className="inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-1">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            pathname.startsWith(tab.href)
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
