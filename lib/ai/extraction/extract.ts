import { generateText, Output, type UserContent } from "ai";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "@/lib/db";
import { categories, transactions, type DocumentRow } from "@/lib/db/schema";
import { readUpload } from "@/lib/storage";
import { EXTRACTION_MODEL } from "@/lib/ai/models";
import {
  BANK_STATEMENT_PROMPT,
  CC_STATEMENT_PROMPT,
  PAYSLIP_PROMPT,
} from "./prompts";
import {
  bankStatementSchema,
  ccStatementSchema,
  payslipSchema,
} from "./schemas";

/**
 * Up to 40 "Merchant → Category" lines learned from the user's existing
 * categorised transactions (most recent merchants first; per merchant the
 * most frequent category wins, ties broken by recency). Never throws.
 */
async function learnedMerchantCategories(): Promise<string[]> {
  try {
    const rows = await getDb()
      .select({ merchant: transactions.merchant, categoryName: categories.name })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(isNotNull(transactions.merchant), isNotNull(transactions.categoryId)),
      )
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(500);

    // Rows arrive most-recent-first, so Map insertion order = merchant recency
    // and the first category seen per merchant is the most recent one.
    type Tally = { display: string; counts: Map<string, number>; seen: string[] };
    const byMerchant = new Map<string, Tally>();
    for (const r of rows) {
      const display = r.merchant?.trim();
      if (!display) continue;
      const key = display.toLowerCase();
      let tally = byMerchant.get(key);
      if (!tally) {
        tally = { display, counts: new Map(), seen: [] };
        byMerchant.set(key, tally);
      }
      const count = tally.counts.get(r.categoryName) ?? 0;
      if (count === 0) tally.seen.push(r.categoryName);
      tally.counts.set(r.categoryName, count + 1);
    }

    const lines: string[] = [];
    for (const { display, counts, seen } of byMerchant.values()) {
      let best = seen[0];
      let bestCount = counts.get(best) ?? 0;
      for (const name of seen) {
        const n = counts.get(name) ?? 0;
        if (n > bestCount) {
          best = name;
          bestCount = n;
        }
      }
      lines.push(`- ${display} → ${best}`);
      if (lines.length >= 40) break;
    }
    return lines;
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "learned-categories-failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return [];
  }
}

/** Statement system prompt + the user's learned merchant→category mappings. */
async function statementSystem(basePrompt: string): Promise<string> {
  const learned = await learnedMerchantCategories();
  if (learned.length === 0) return basePrompt;
  return `${basePrompt}

The user has previously categorised these merchants — prefer these when suggesting categories for matching merchants:
${learned.join("\n")}`;
}

/**
 * Runs Gemini structured extraction over an uploaded document.
 * PDFs/images are passed as file parts (Gemini reads them natively);
 * CSVs are inlined as text.
 */
export async function extractDocument(doc: DocumentRow): Promise<unknown> {
  const bytes = await readUpload(doc);

  const content: UserContent =
    doc.mimeType === "text/csv"
      ? [
          {
            type: "text",
            text: `CSV file "${doc.fileName}":\n\n${bytes.toString("utf8").slice(0, 200_000)}`,
          },
        ]
      : [
          {
            type: "file",
            data: new Uint8Array(bytes),
            mediaType: doc.mimeType,
          },
          {
            type: "text",
            text: `Parse the attached document ("${doc.fileName}") according to the rules.`,
          },
        ];

  switch (doc.docType) {
    case "bank_statement":
      return run(bankStatementSchema, await statementSystem(BANK_STATEMENT_PROMPT), content);
    case "credit_card_statement":
      return run(ccStatementSchema, await statementSystem(CC_STATEMENT_PROMPT), content);
    case "payslip":
      return run(payslipSchema, PAYSLIP_PROMPT, content);
    default:
      throw new Error(
        `Extraction is not supported for document type "${doc.docType}"`,
      );
  }
}

// Result is persisted as jsonb and re-validated at commit time, so the
// zod-validated object is returned as unknown here.
async function run<SCHEMA extends z.ZodType>(
  schema: SCHEMA,
  system: string,
  content: UserContent,
): Promise<unknown> {
  const { output } = await generateText({
    model: EXTRACTION_MODEL,
    system,
    output: Output.object({ schema }),
    messages: [{ role: "user", content }],
  });
  return output;
}
