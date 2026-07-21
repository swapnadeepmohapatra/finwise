import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { chatMessages, conversations } from "@/lib/db/schema";
import { hasGeminiKey } from "@/lib/ai/models";
import type { AdvisorUIMessage } from "@/lib/ai/agents/advisor";
import { AdvisorChat } from "@/components/features/advisor/advisor-chat";

export const metadata: Metadata = { title: "Advisor" };
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdvisorConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  if (!UUID_RE.test(conversationId)) redirect("/advisor");

  const db = getDb();
  const [history, messageRows] = await Promise.all([
    db.select().from(conversations).orderBy(desc(conversations.updatedAt)).limit(50),
    db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(asc(chatMessages.createdAt)),
  ]);

  return (
    <AdvisorChat
      conversationId={conversationId}
      initialMessages={messageRows.map((m) => m.message as AdvisorUIMessage)}
      history={history.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt.toISOString(),
      }))}
      keyMissing={!hasGeminiKey()}
    />
  );
}
