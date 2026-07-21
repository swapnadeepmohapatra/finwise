import { PlanningTabs } from "@/components/features/planning/planning-tabs";

export default function PlanningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Planning</h1>
      <PlanningTabs />
      {children}
    </div>
  );
}
