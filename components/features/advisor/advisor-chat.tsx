"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  isToolUIPart,
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { useChat } from "@ai-sdk/react";
import { Bot, MessageSquarePlus, ShieldQuestion, Trash2 } from "lucide-react";
import type { AdvisorUIMessage } from "@/lib/ai/agents/advisor";
import { deleteConversation } from "@/lib/actions/conversations";
import { formatDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

const STARTERS = [
  "How much did I spend on food last month?",
  "Am I saving enough every month?",
  "What bills and SIPs are coming up?",
  "How are my investments performing?",
  "What's my net worth right now?",
];

type HistoryItem = { id: string; title: string; updatedAt: string };

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Human-readable one-liner for a write-tool approval card. */
function approvalSummary(type: string, rawInput: unknown): string {
  const input = (rawInput ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const amount = typeof input.amountInr === "number" ? inr(input.amountInr) : null;
  switch (type) {
    case "tool-addTransaction":
      return [
        `Record ${str(input.type) || "transaction"} of ${amount ?? "?"}`,
        `— "${str(input.description)}"`,
        input.merchant ? `at ${str(input.merchant)}` : "",
        input.categoryName ? `(${str(input.categoryName)})` : "",
        input.accountName ? `in ${str(input.accountName)}` : "",
        input.date ? `on ${str(input.date)}` : "dated today",
      ]
        .filter(Boolean)
        .join(" ");
    case "tool-markBillPaid":
      return [
        `Mark the ${str(input.cardName)} credit card bill as paid`,
        amount ? `(${amount})` : "(full remaining due)",
        input.fromAccountName ? `from ${str(input.fromAccountName)}` : "",
        input.paidDate ? `on ${str(input.paidDate)}` : "",
      ]
        .filter(Boolean)
        .join(" ");
    case "tool-markSipPaid":
      return [
        `Mark the ${str(input.sipName)} SIP installment`,
        input.dueDate ? `due ${str(input.dueDate)}` : "(earliest upcoming)",
        "as paid",
      ]
        .filter(Boolean)
        .join(" ");
    default:
      return `Run ${type.replace(/^tool-/, "")} with the parameters shown below`;
  }
}

export function AdvisorChat({
  conversationId,
  initialMessages,
  history,
  keyMissing,
}: {
  conversationId: string;
  initialMessages: AdvisorUIMessage[];
  history: HistoryItem[];
  keyMissing: boolean;
}) {
  const router = useRouter();
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { conversationId },
      }),
    [conversationId],
  );
  const { messages, sendMessage, status, error, addToolApprovalResponse } =
    useChat<AdvisorUIMessage>({
      id: conversationId,
      messages: initialMessages,
      transport,
      // Continue the conversation automatically once every pending approval
      // has been answered, so the approved tool executes server-side.
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    });
  const [deleting, setDeleting] = useState(false);

  const ask = (text: string) => {
    if (keyMissing) {
      toast.error("Add GEMINI_API_KEY to .env.local first");
      return;
    }
    sendMessage({ text });
  };

  return (
    <div className="flex h-[calc(100svh-8.5rem)] gap-4 md:h-[calc(100svh-3rem)]">
      {/* History sidebar (desktop) */}
      <Card className="hidden w-64 shrink-0 flex-col gap-0 p-0 lg:flex">
        <div className="flex items-center justify-between border-b p-3">
          <p className="text-sm font-medium">Conversations</p>
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href="/advisor" aria-label="New conversation">
              <MessageSquarePlus className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-1 p-2">
            {history.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">
                No conversations yet.
              </p>
            ) : (
              history.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
                    c.id === conversationId
                      ? "bg-accent"
                      : "hover:bg-accent/60",
                  )}
                >
                  <Link href={`/advisor/${c.id}`} className="min-w-0 flex-1">
                    <p className="truncate">{c.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDate(c.updatedAt.slice(0, 10))}
                    </p>
                  </Link>
                  <button
                    type="button"
                    className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    aria-label={`Delete ${c.title}`}
                    disabled={deleting}
                    onClick={async () => {
                      setDeleting(true);
                      await deleteConversation(c.id);
                      setDeleting(false);
                      toast.success("Conversation deleted");
                      if (c.id === conversationId) router.push("/advisor");
                      else router.refresh();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Chat pane */}
      <div className="flex min-w-0 flex-1 flex-col">
        {keyMissing ? (
          <Alert className="mb-3">
            <AlertDescription>
              The advisor needs a Gemini API key. Add <code>GEMINI_API_KEY=…</code>{" "}
              to <code>.env.local</code> (free key at aistudio.google.com/apikey)
              and restart the dev server.
            </AlertDescription>
          </Alert>
        ) : null}

        <Conversation className="min-h-0 flex-1">
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState>
                <Bot className="h-10 w-10 text-muted-foreground" />
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">Ask about your money</h3>
                  <p className="text-sm text-muted-foreground">
                    The advisor reads your real Finwise data — spending, income,
                    SIPs, holdings and bills.
                  </p>
                </div>
                <Suggestions className="mt-4 max-w-xl flex-wrap justify-center">
                  {STARTERS.map((s) => (
                    <Suggestion key={s} suggestion={s} onClick={() => ask(s)} />
                  ))}
                </Suggestions>
              </ConversationEmptyState>
            ) : (
              messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent>
                    {message.parts.map((part, i) => {
                      if (part.type === "text") {
                        return (
                          <MessageResponse key={i}>{part.text}</MessageResponse>
                        );
                      }
                      if (isToolUIPart(part)) {
                        if (
                          part.state === "approval-requested" &&
                          !part.approval.isAutomatic
                        ) {
                          const toolName =
                            part.type === "dynamic-tool"
                              ? part.toolName
                              : part.type.replace(/^tool-/, "");
                          const approvalId = part.approval.id;
                          return (
                            <Card key={i} className="my-2 gap-3 p-4">
                              <div className="flex items-start gap-2">
                                <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0 space-y-1">
                                  <p className="text-sm font-medium">
                                    Approve this action? ({toolName})
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {approvalSummary(part.type, part.input)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    addToolApprovalResponse({
                                      id: approvalId,
                                      approved: true,
                                    })
                                  }
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    addToolApprovalResponse({
                                      id: approvalId,
                                      approved: false,
                                    })
                                  }
                                >
                                  Deny
                                </Button>
                              </div>
                            </Card>
                          );
                        }
                        return (
                          <Tool key={i}>
                            {part.type === "dynamic-tool" ? (
                              <ToolHeader
                                type={part.type}
                                state={part.state}
                                toolName={part.toolName}
                              />
                            ) : (
                              <ToolHeader type={part.type} state={part.state} />
                            )}
                            <ToolContent>
                              <ToolInput input={part.input} />
                              <ToolOutput
                                output={
                                  part.state === "output-available" ? (
                                    <pre className="max-h-64 overflow-auto text-xs">
                                      {JSON.stringify(part.output, null, 2)}
                                    </pre>
                                  ) : undefined
                                }
                                errorText={
                                  part.state === "output-error"
                                    ? part.errorText
                                    : undefined
                                }
                              />
                            </ToolContent>
                          </Tool>
                        );
                      }
                      return null;
                    })}
                  </MessageContent>
                </Message>
              ))
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {error ? (
          <Alert variant="destructive" className="mb-2">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        <PromptInput
          className="mt-2"
          onSubmit={({ text }) => {
            if (text?.trim()) ask(text.trim());
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea placeholder="Ask about your finances…" />
          </PromptInputBody>
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
