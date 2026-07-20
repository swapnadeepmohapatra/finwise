import type { Metadata } from "next";
import { InvestmentsTabs } from "@/components/features/investments/investments-tabs";

export const metadata: Metadata = { title: "Investments" };

export default function InvestmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Investments</h1>
      <InvestmentsTabs />
      {children}
    </div>
  );
}
