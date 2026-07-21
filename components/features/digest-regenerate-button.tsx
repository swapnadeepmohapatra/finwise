"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Client button: force-regenerates the weekly digest via the cron route. */
export function DigestRegenerateButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    try {
      const res = await fetch("/api/cron/weekly-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const json = (await res.json().catch(() => null)) as {
        generated?: boolean;
        error?: string;
      } | null;
      if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
      if (json?.generated) {
        router.refresh();
      } else {
        toast.error("Digest was not generated — is the Gemini key configured?");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate the digest",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={run} disabled={pending}>
      <RefreshCw className={pending ? "animate-spin" : undefined} />
      {pending ? "Generating…" : label}
    </Button>
  );
}
