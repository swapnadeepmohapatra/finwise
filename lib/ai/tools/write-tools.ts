import { revalidatePath } from "next/cache";
import { tool } from "ai";
import { z } from "zod";
import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  accounts,
  categories,
  creditCardBills,
  sipInstallments,
  sips,
  transactions,
} from "@/lib/db/schema";
import { dedupeHash } from "@/lib/db/dedupe";
import { rupeesToPaise } from "@/lib/utils/money";
import { todayIST } from "@/lib/utils/dates";
import { inrDeep } from "@/lib/ai/tools/finance-tools";

// Write tools for the advisor agent. Every tool here mutates the user's data,
// so each one is gated behind the AI SDK approval flow: the agent config marks
// them 'user-approval' (see writeToolApproval below) and the chat UI renders
// an Approve/Deny card before execute() ever runs.

const dateArg = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("ISO date YYYY-MM-DD");

type ActiveAccount = {
  id: string;
  name: string;
  type: "bank" | "credit_card" | "demat" | "cash" | "wallet";
};

async function listActiveAccounts(): Promise<ActiveAccount[]> {
  return getDb()
    .select({ id: accounts.id, name: accounts.name, type: accounts.type })
    .from(accounts)
    .where(eq(accounts.isActive, true))
    .orderBy(asc(accounts.createdAt));
}

/**
 * Case-insensitive account lookup: exact name match first, then unique
 * substring match. Returns an error object (never throws) so the model can
 * recover by asking the user or retrying with a listed name.
 */
function matchAccountByName(
  active: ActiveAccount[],
  name: string,
): { account: ActiveAccount } | { error: string; accountNames: string[] } {
  const lower = name.trim().toLowerCase();
  const exact = active.filter((a) => a.name.toLowerCase() === lower);
  if (exact.length === 1) return { account: exact[0] };
  const partial = active.filter((a) => a.name.toLowerCase().includes(lower));
  if (partial.length === 1) return { account: partial[0] };
  const names = active.map((a) => `${a.name} (${a.type})`);
  return {
    error:
      partial.length > 1
        ? `Account name "${name}" is ambiguous — it matches: ${partial.map((a) => a.name).join(", ")}. Ask the user which one they mean.`
        : `No active account named "${name}". Available accounts: ${names.join(", ")}.`,
    accountNames: active.map((a) => a.name),
  };
}

export const writeTools = {
  addTransaction: tool({
    description:
      "Record a new income or expense transaction for the user. Requires user approval before it is saved. Amount is in rupees. If the user has multiple bank accounts, accountName must be provided.",
    inputSchema: z.object({
      type: z.enum(["income", "expense"]),
      amountInr: z.number().positive().describe("Amount in rupees"),
      date: dateArg.optional().describe("Defaults to today (IST)"),
      description: z.string().min(1).describe("What the transaction was for"),
      merchant: z.string().optional(),
      categoryName: z
        .string()
        .optional()
        .describe("Category name, e.g. Food, Salary (matched case-insensitively)"),
      accountName: z
        .string()
        .optional()
        .describe("Account to record against; defaults to the only active bank account"),
    }),
    execute: async ({ type, amountInr, date, description, merchant, categoryName, accountName }) => {
      const db = getDb();
      const amountPaise = rupeesToPaise(amountInr);
      if (amountPaise <= 0) return { error: "Amount must be positive" };
      const txnDate = date ?? todayIST();

      const active = await listActiveAccounts();
      let account: ActiveAccount;
      if (accountName) {
        const match = matchAccountByName(active, accountName);
        if ("error" in match) return match;
        account = match.account;
      } else {
        const banks = active.filter((a) => a.type === "bank");
        if (banks.length === 1) {
          account = banks[0];
        } else {
          return {
            error:
              banks.length === 0
                ? "No active bank account found. Ask the user to add an account first or name a specific account."
                : `Multiple bank accounts exist — specify accountName. Available accounts: ${active.map((a) => `${a.name} (${a.type})`).join(", ")}.`,
            accountNames: active.map((a) => a.name),
          };
        }
      }

      let categoryId: string | null = null;
      let resolvedCategoryName: string | null = null;
      let note: string | undefined;
      if (categoryName) {
        const category = await db.query.categories.findFirst({
          where: and(ilike(categories.name, categoryName), eq(categories.kind, type)),
        });
        if (category) {
          categoryId = category.id;
          resolvedCategoryName = category.name;
        } else {
          note = `No ${type} category named "${categoryName}" — transaction saved uncategorised.`;
        }
      }

      const [txn] = await db
        .insert(transactions)
        .values({
          accountId: account.id,
          type,
          amountPaise,
          date: txnDate,
          description,
          merchant: merchant ?? null,
          categoryId,
          dedupeHash: dedupeHash(account.id, txnDate, amountPaise, description),
        })
        .returning({ id: transactions.id });

      revalidatePath("/transactions");
      revalidatePath("/");

      return inrDeep({
        recorded: true,
        transactionId: txn.id,
        type,
        amountPaise,
        date: txnDate,
        description,
        merchant: merchant ?? null,
        accountName: account.name,
        categoryName: resolvedCategoryName,
        ...(note ? { note } : {}),
      });
    },
  }),

  markBillPaid: tool({
    description:
      "Mark the latest unpaid credit card bill of a card as paid (fully by default, or a partial amount in rupees). Requires user approval. Optionally records the payment as a transfer from a bank account and reduces that account's balance.",
    inputSchema: z.object({
      cardName: z.string().min(1).describe("Credit card account name (fuzzy matched)"),
      amountInr: z
        .number()
        .positive()
        .optional()
        .describe("Amount paid in rupees; defaults to the full remaining due"),
      paidDate: dateArg.optional().describe("Defaults to today (IST)"),
      fromAccountName: z
        .string()
        .optional()
        .describe("Bank account the payment was made from (creates a transfer transaction)"),
    }),
    execute: async ({ cardName, amountInr, paidDate, fromAccountName }) => {
      const db = getDb();
      const active = await listActiveAccounts();
      const cards = active.filter((a) => a.type === "credit_card");
      if (cards.length === 0) return { error: "No active credit card accounts exist." };
      const cardMatch = matchAccountByName(cards, cardName);
      if ("error" in cardMatch) return cardMatch;
      const card = cardMatch.account;

      const bill = await db.query.creditCardBills.findFirst({
        where: and(
          eq(creditCardBills.accountId, card.id),
          inArray(creditCardBills.status, ["unpaid", "partially_paid"]),
        ),
        orderBy: desc(creditCardBills.statementDate),
      });
      if (!bill) {
        return { error: `No unpaid or partially paid bill found for ${card.name}.` };
      }

      const remainingPaise = Math.max(bill.totalDuePaise - bill.paidPaise, 0);
      const amountPaidPaise = amountInr != null ? rupeesToPaise(amountInr) : remainingPaise;
      if (amountPaidPaise <= 0) return { error: "Payment amount must be positive" };
      const date = paidDate ?? todayIST();

      // Resolve the paying account before touching the bill so a bad name
      // cannot leave a half-applied payment.
      let fromAccount: ActiveAccount | null = null;
      if (fromAccountName) {
        const nonCard = active.filter((a) => a.id !== card.id);
        const fromMatch = matchAccountByName(nonCard, fromAccountName);
        if ("error" in fromMatch) return fromMatch;
        fromAccount = fromMatch.account;
      }

      const newPaidPaise = bill.paidPaise + amountPaidPaise;
      const newStatus = newPaidPaise >= bill.totalDuePaise ? "paid" : "partially_paid";
      await db
        .update(creditCardBills)
        .set({ paidPaise: newPaidPaise, status: newStatus, paidDate: date })
        .where(eq(creditCardBills.id, bill.id));

      if (fromAccount) {
        const description = `Credit card bill payment — ${card.name}`;
        await db.insert(transactions).values({
          accountId: fromAccount.id,
          counterAccountId: card.id,
          type: "transfer",
          amountPaise: amountPaidPaise,
          date,
          description,
          dedupeHash: dedupeHash(fromAccount.id, date, amountPaidPaise, description),
        });
        await db
          .update(accounts)
          .set({
            currentBalancePaise: sql`coalesce(${accounts.currentBalancePaise}, 0) - ${amountPaidPaise}`,
            updatedAt: new Date(),
          })
          .where(eq(accounts.id, fromAccount.id));
      }

      revalidatePath("/credit-cards");
      revalidatePath("/");
      revalidatePath("/transactions");

      return inrDeep({
        recorded: true,
        cardName: card.name,
        billId: bill.id,
        dueDate: bill.dueDate,
        amountPaidPaise,
        remainingAfterPaise: Math.max(bill.totalDuePaise - newPaidPaise, 0),
        status: newStatus,
        paidDate: date,
        paidFromAccount: fromAccount?.name ?? null,
      });
    },
  }),

  markSipPaid: tool({
    description:
      "Mark a SIP installment as paid — the earliest upcoming installment by default, or the one at a specific due date. Requires user approval. SIP is found by fuzzy name match.",
    inputSchema: z.object({
      sipName: z.string().min(1).describe("SIP name (fuzzy matched)"),
      dueDate: dateArg
        .optional()
        .describe("Due date of the specific installment; defaults to the earliest upcoming one"),
    }),
    execute: async ({ sipName, dueDate }) => {
      const db = getDb();
      const pattern = `%${sipName.trim()}%`;
      const matches = await db
        .select({ id: sips.id, name: sips.name })
        .from(sips)
        .where(ilike(sips.name, pattern));
      if (matches.length === 0) {
        const all = await db.select({ name: sips.name }).from(sips);
        return {
          error: `No SIP matching "${sipName}". Existing SIPs: ${all.map((s) => s.name).join(", ") || "none"}.`,
        };
      }
      const exact = matches.filter((s) => s.name.toLowerCase() === sipName.trim().toLowerCase());
      if (matches.length > 1 && exact.length !== 1) {
        return {
          error: `SIP name "${sipName}" is ambiguous — it matches: ${matches.map((s) => s.name).join(", ")}. Ask the user which one they mean.`,
        };
      }
      const sip = exact.length === 1 ? exact[0] : matches[0];

      const installment = await db.query.sipInstallments.findFirst({
        where: dueDate
          ? and(eq(sipInstallments.sipId, sip.id), eq(sipInstallments.dueDate, dueDate))
          : and(eq(sipInstallments.sipId, sip.id), eq(sipInstallments.status, "upcoming")),
        orderBy: asc(sipInstallments.dueDate),
      });
      if (!installment) {
        return {
          error: dueDate
            ? `No installment of "${sip.name}" due on ${dueDate}.`
            : `No upcoming installment found for "${sip.name}".`,
        };
      }
      if (installment.status === "paid") {
        return { error: `The ${installment.dueDate} installment of "${sip.name}" is already marked paid.` };
      }

      await db
        .update(sipInstallments)
        .set({ status: "paid" })
        .where(eq(sipInstallments.id, installment.id));

      revalidatePath("/investments/sips");
      revalidatePath("/");

      return inrDeep({
        recorded: true,
        sipName: sip.name,
        installmentId: installment.id,
        dueDate: installment.dueDate,
        amountPaise: installment.amountPaise,
        status: "paid",
      });
    },
  }),
};

/** Approval policy for the advisor agent: every write tool needs explicit user approval. */
export const writeToolApproval = {
  addTransaction: "user-approval",
  markBillPaid: "user-approval",
  markSipPaid: "user-approval",
} as const;
