"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Triggers the AMFI NAV + stock price refresh endpoint. */
export function RefreshNavsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch("/api/cron/refresh-navs", { method: "POST" });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j.error ?? "Refresh failed");
          toast.success(
            `Updated ${j.mfUpdated ?? 0} fund NAVs, ${j.stocksUpdated ?? 0} stock prices`,
          );
          router.refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Refresh failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      Refresh prices
    </Button>
  );
}
