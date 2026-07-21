import { Sparkles } from "lucide-react";
import { getDailyInsights } from "@/lib/ai/insights";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Server component — render inside <Suspense>. Renders nothing without a key. */
export async function InsightsCard() {
  const insights = await getDailyInsights();
  if (!insights) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-emerald-500" /> Today&apos;s insights
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        <MessageResponse>{insights}</MessageResponse>
      </CardContent>
    </Card>
  );
}
