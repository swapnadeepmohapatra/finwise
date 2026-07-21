import { Newspaper } from "lucide-react";
import { getWeeklyDigest } from "@/lib/ai/digest";
import { hasGeminiKey } from "@/lib/ai/models";
import { MessageResponse } from "@/components/ai-elements/message";
import { DigestRegenerateButton } from "@/components/features/digest-regenerate-button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Server component — render inside <Suspense>. Renders nothing without a key. */
export async function DigestCard() {
  const digest = await getWeeklyDigest();

  if (digest) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Newspaper className="h-4 w-4 text-emerald-500" /> Weekly digest
          </CardTitle>
          {hasGeminiKey() ? (
            <CardAction>
              <DigestRegenerateButton label="Regenerate" />
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="text-sm">
          <MessageResponse>{digest.content}</MessageResponse>
        </CardContent>
      </Card>
    );
  }

  if (!hasGeminiKey()) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Newspaper className="h-4 w-4 text-emerald-500" /> Weekly digest
        </CardTitle>
        <CardDescription>
          No digest for this week yet — generate one from your latest activity.
        </CardDescription>
        <CardAction>
          <DigestRegenerateButton label="Generate digest" />
        </CardAction>
      </CardHeader>
    </Card>
  );
}
