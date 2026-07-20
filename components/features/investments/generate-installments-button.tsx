"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CalendarSync } from "lucide-react";
import { generateUpcomingInstallments } from "@/lib/actions/sips";
import { Button } from "@/components/ui/button";

export function GenerateInstallmentsButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await generateUpcomingInstallments();
          if (result.error) {
            toast.error(result.error);
          } else if (result.created) {
            toast.success(
              `Generated ${result.created} installment${result.created === 1 ? "" : "s"}`,
            );
          } else {
            toast.success("Installments already up to date");
          }
        })
      }
    >
      <CalendarSync className="h-4 w-4" />
      {pending ? "Generating…" : "Generate upcoming installments"}
    </Button>
  );
}
