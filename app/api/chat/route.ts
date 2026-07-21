import { NextResponse } from "next/server";
import { createAgentUIStreamResponse, generateText, type UIMessage } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { isApiAuthenticated } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { chatMessages, conversations } from "@/lib/db/schema";
import {
  createAdvisorAgent,
  type AdvisorUIMessage,
} from "@/lib/ai/agents/advisor";
import { CHEAP_MODEL, hasGeminiKey } from "@/lib/ai/models";

export const maxDuration = 120;

const bodySchema = z.object({
  messages: z.array(z.unknown()),
  conversationId: z.string().uuid(),
});

function firstUserText(messages: UIMessage[]): string {
  for (const m of messages) {
    if (m.role !== "user") continue;
    for (const part of m.parts) {
      if (part.type === "text" && part.text.trim()) return part.text.trim();
    }
  }
  return "";
}

async function persistConversation(conversationId: string, messages: UIMessage[]) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(chatMessages).where(eq(chatMessages.conversationId, conversationId));
    if (messages.length > 0) {
      await tx.insert(chatMessages).values(
        messages.map((m) => ({
          conversationId,
          role: m.role,
          message: m as unknown as Record<string, unknown>,
        })),
      );
    }
    await tx
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  });
}

async function maybeGenerateTitle(conversationId: string, messages: UIMessage[]) {
  const db = getDb();
  const convo = await db.query.conversations.findFirst({
    where: (c, { eq: eqOp }) => eqOp(c.id, conversationId),
  });
  if (!convo || convo.title !== "New conversation") return;
  const seed = firstUserText(messages);
  if (!seed) return;
  try {
    const { text } = await generateText({
      model: CHEAP_MODEL,
      prompt: `Write a 3-6 word title for a personal-finance chat that starts with this question. Return ONLY the title, no quotes.\n\nQuestion: ${seed.slice(0, 300)}`,
    });
    const title = text.trim().replace(/^["']|["']$/g, "").slice(0, 60);
    if (title) {
      await db
        .update(conversations)
        .set({ title })
        .where(eq(conversations.id, conversationId));
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "title-generation-failed",
        conversationId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

export async function POST(req: Request) {
  if (!(await isApiAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasGeminiKey()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set — add it to .env.local to enable the advisor" },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { messages, conversationId } = parsed.data;

  await getDb()
    .insert(conversations)
    .values({ id: conversationId })
    .onConflictDoNothing();

  const start = Date.now();
  return createAgentUIStreamResponse({
    agent: createAdvisorAgent(),
    uiMessages: messages,
    originalMessages: messages as AdvisorUIMessage[],
    onEnd: async ({ messages: finalMessages }) => {
      try {
        await persistConversation(conversationId, finalMessages as UIMessage[]);
        await maybeGenerateTitle(conversationId, finalMessages as UIMessage[]);
        console.log(
          JSON.stringify({
            level: "info",
            msg: "chat-done",
            conversationId,
            messages: finalMessages.length,
            ms: Date.now() - start,
          }),
        );
      } catch (err) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "chat-persist-failed",
            conversationId,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Something went wrong";
      console.error(
        JSON.stringify({ level: "error", msg: "chat-failed", conversationId, error: message }),
      );
      return message;
    },
  });
}
