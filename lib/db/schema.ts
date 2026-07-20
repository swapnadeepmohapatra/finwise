import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────────────────────────

export const accountTypeEnum = pgEnum("account_type", [
  "bank",
  "credit_card",
  "demat",
  "cash",
  "wallet",
]);
export const txnTypeEnum = pgEnum("txn_type", ["income", "expense", "transfer"]);
export const txnSourceEnum = pgEnum("txn_source", ["manual", "import"]);
export const categoryKindEnum = pgEnum("category_kind", ["income", "expense"]);
export const sipFrequencyEnum = pgEnum("sip_frequency", [
  "monthly",
  "weekly",
  "quarterly",
]);
export const sipAssetKindEnum = pgEnum("sip_asset_kind", [
  "mutual_fund",
  "stock",
  "other",
]);
export const installmentStatusEnum = pgEnum("installment_status", [
  "upcoming",
  "paid",
  "skipped",
]);
export const billStatusEnum = pgEnum("bill_status", [
  "unpaid",
  "partially_paid",
  "paid",
]);
export const docTypeEnum = pgEnum("doc_type", [
  "bank_statement",
  "credit_card_statement",
  "payslip",
  "other",
]);
export const docStatusEnum = pgEnum("doc_status", [
  "uploaded",
  "extracting",
  "extracted",
  "committed",
  "failed",
]);
export const holdingKindEnum = pgEnum("holding_kind", [
  "equity",
  "debt",
  "hybrid",
  "elss",
  "index",
  "liquid",
  "other",
]);
export const exchangeEnum = pgEnum("exchange", ["NSE", "BSE"]);
export const assetKindEnum = pgEnum("asset_kind", [
  "epf",
  "ppf",
  "nps",
  "fd",
  "rd",
  "gold",
  "real_estate",
  "other",
]);

// All *Paise columns store integer paise (₹1 = 100 paise).

export type LabeledAmount = { label: string; amountPaise: number };

// ── Accounts & balances ────────────────────────────────────────────────────

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull(),
  institution: text("institution"),
  last4: text("last4"),
  currentBalancePaise: bigint("current_balance_paise", { mode: "number" }),
  creditLimitPaise: bigint("credit_limit_paise", { mode: "number" }),
  billDueDay: integer("bill_due_day"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const balanceSnapshots = pgTable(
  "balance_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    balancePaise: bigint("balance_paise", { mode: "number" }).notNull(),
    asOf: date("as_of").notNull(),
  },
  (t) => [uniqueIndex("balance_snapshots_account_date_idx").on(t.accountId, t.asOf)],
);

// ── Categories ─────────────────────────────────────────────────────────────

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  kind: categoryKindEnum("kind").notNull(),
  icon: text("icon"),
  color: text("color"),
  isDefault: boolean("is_default").notNull().default(false),
});

// ── Documents (uploads + AI extraction state) ──────────────────────────────

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileName: text("file_name").notNull(),
  blobUrl: text("blob_url").notNull(),
  blobPathname: text("blob_pathname").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  docType: docTypeEnum("doc_type").notNull(),
  status: docStatusEnum("status").notNull().default("uploaded"),
  extractionJson: jsonb("extraction_json"),
  extractionError: text("extraction_error"),
  linkedAccountId: uuid("linked_account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  extractedAt: timestamp("extracted_at", { withTimezone: true }),
  committedAt: timestamp("committed_at", { withTimezone: true }),
});

// ── Transactions ───────────────────────────────────────────────────────────

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    type: txnTypeEnum("type").notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    date: date("date").notNull(),
    description: text("description").notNull(),
    merchant: text("merchant"),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    counterAccountId: uuid("counter_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    source: txnSourceEnum("source").notNull().default("manual"),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    // sha256(accountId|date|amountPaise|normalized description) — non-unique,
    // used to flag likely duplicates during statement import review.
    dedupeHash: text("dedupe_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_date_idx").on(t.date),
    index("transactions_account_date_idx").on(t.accountId, t.date),
    index("transactions_category_idx").on(t.categoryId),
    index("transactions_dedupe_idx").on(t.dedupeHash),
  ],
);

// ── Salary ─────────────────────────────────────────────────────────────────

export const salaryEntries = pgTable("salary_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  month: date("month").notNull().unique(), // first day of month
  employer: text("employer").notNull(),
  grossPaise: bigint("gross_paise", { mode: "number" }).notNull(),
  netPaise: bigint("net_paise", { mode: "number" }).notNull(),
  basicPaise: bigint("basic_paise", { mode: "number" }),
  hraPaise: bigint("hra_paise", { mode: "number" }),
  specialAllowancePaise: bigint("special_allowance_paise", { mode: "number" }),
  otherEarnings: jsonb("other_earnings").$type<LabeledAmount[]>(),
  pfPaise: bigint("pf_paise", { mode: "number" }),
  professionalTaxPaise: bigint("professional_tax_paise", { mode: "number" }),
  incomeTaxPaise: bigint("income_tax_paise", { mode: "number" }),
  otherDeductions: jsonb("other_deductions").$type<LabeledAmount[]>(),
  creditedAccountId: uuid("credited_account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  transactionId: uuid("transaction_id").references(() => transactions.id, {
    onDelete: "set null",
  }),
  documentId: uuid("document_id").references(() => documents.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Investments ────────────────────────────────────────────────────────────

export const mfHoldings = pgTable("mf_holdings", {
  id: uuid("id").primaryKey().defaultRandom(),
  schemeName: text("scheme_name").notNull(),
  amc: text("amc"),
  folioNo: text("folio_no"),
  isin: text("isin"), // used for exact AMFI NAV matching
  holdingKind: holdingKindEnum("holding_kind").notNull().default("equity"),
  units: numeric("units", { precision: 18, scale: 4 }).notNull(),
  avgNav: numeric("avg_nav", { precision: 18, scale: 4 }),
  investedPaise: bigint("invested_paise", { mode: "number" }).notNull(),
  currentNav: numeric("current_nav", { precision: 18, scale: 4 }),
  currentValuePaise: bigint("current_value_paise", { mode: "number" }),
  navAsOf: date("nav_as_of"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sips = pgTable("sips", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  schemeName: text("scheme_name"),
  assetKind: sipAssetKindEnum("asset_kind").notNull().default("mutual_fund"),
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  frequency: sipFrequencyEnum("frequency").notNull().default("monthly"),
  dayOfMonth: integer("day_of_month").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  isActive: boolean("is_active").notNull().default(true),
  mfHoldingId: uuid("mf_holding_id").references(() => mfHoldings.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sipInstallments = pgTable(
  "sip_installments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sipId: uuid("sip_id")
      .notNull()
      .references(() => sips.id, { onDelete: "cascade" }),
    dueDate: date("due_date").notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    units: numeric("units", { precision: 18, scale: 4 }),
    nav: numeric("nav", { precision: 18, scale: 4 }),
    status: installmentStatusEnum("status").notNull().default("upcoming"),
    transactionId: uuid("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
  },
  (t) => [uniqueIndex("sip_installments_sip_due_idx").on(t.sipId, t.dueDate)],
);

export const stockHoldings = pgTable("stock_holdings", {
  id: uuid("id").primaryKey().defaultRandom(),
  dematAccountId: uuid("demat_account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  ticker: text("ticker").notNull(),
  exchange: exchangeEnum("exchange").notNull().default("NSE"),
  companyName: text("company_name"),
  quantity: numeric("quantity", { precision: 14, scale: 2 }).notNull(),
  avgPricePaise: bigint("avg_price_paise", { mode: "number" }).notNull(),
  investedPaise: bigint("invested_paise", { mode: "number" }).notNull(),
  currentPricePaise: bigint("current_price_paise", { mode: "number" }),
  currentValuePaise: bigint("current_value_paise", { mode: "number" }),
  priceAsOf: date("price_as_of"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Credit card bills ──────────────────────────────────────────────────────

export const creditCardBills = pgTable(
  "credit_card_bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    statementDate: date("statement_date").notNull(),
    dueDate: date("due_date").notNull(),
    totalDuePaise: bigint("total_due_paise", { mode: "number" }).notNull(),
    minDuePaise: bigint("min_due_paise", { mode: "number" }),
    status: billStatusEnum("status").notNull().default("unpaid"),
    paidPaise: bigint("paid_paise", { mode: "number" }).notNull().default(0),
    paidDate: date("paid_date"),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
  },
  (t) => [uniqueIndex("cc_bills_account_statement_idx").on(t.accountId, t.statementDate)],
);

// ── Other assets & loans (net-worth components) ────────────────────────────

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: assetKindEnum("kind").notNull().default("other"),
  valuePaise: bigint("value_paise", { mode: "number" }).notNull(),
  institution: text("institution"),
  maturityDate: date("maturity_date"),
  annualRatePct: numeric("annual_rate_pct", { precision: 5, scale: 2 }),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loans = pgTable("loans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  lender: text("lender"),
  principalPaise: bigint("principal_paise", { mode: "number" }).notNull(),
  annualRatePct: numeric("annual_rate_pct", { precision: 5, scale: 2 }).notNull(),
  emiPaise: bigint("emi_paise", { mode: "number" }).notNull(),
  startDate: date("start_date").notNull(),
  tenureMonths: integer("tenure_months").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Budgets & goals ────────────────────────────────────────────────────────

export const budgets = pgTable("budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id")
    .notNull()
    .unique()
    .references(() => categories.id, { onDelete: "cascade" }),
  monthlyLimitPaise: bigint("monthly_limit_paise", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  targetPaise: bigint("target_paise", { mode: "number" }).notNull(),
  savedPaise: bigint("saved_paise", { mode: "number" }).notNull().default(0),
  targetDate: date("target_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── AI weekly digests (cache) ──────────────────────────────────────────────

export const aiDigests = pgTable("ai_digests", {
  id: uuid("id").primaryKey().defaultRandom(),
  weekStart: date("week_start").notNull().unique(), // Monday (IST)
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Advisor chat ───────────────────────────────────────────────────────────

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull().default("New conversation"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    // Full UIMessage JSON so tool-call parts round-trip losslessly into useChat.
    message: jsonb("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

// ── Relations ──────────────────────────────────────────────────────────────

export const accountsRelations = relations(accounts, ({ many }) => ({
  transactions: many(transactions),
  balanceSnapshots: many(balanceSnapshots),
  bills: many(creditCardBills),
  stockHoldings: many(stockHoldings),
}));

export const balanceSnapshotsRelations = relations(balanceSnapshots, ({ one }) => ({
  account: one(accounts, {
    fields: [balanceSnapshots.accountId],
    references: [accounts.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  counterAccount: one(accounts, {
    fields: [transactions.counterAccountId],
    references: [accounts.id],
  }),
  document: one(documents, {
    fields: [transactions.documentId],
    references: [documents.id],
  }),
}));

export const salaryEntriesRelations = relations(salaryEntries, ({ one }) => ({
  creditedAccount: one(accounts, {
    fields: [salaryEntries.creditedAccountId],
    references: [accounts.id],
  }),
  transaction: one(transactions, {
    fields: [salaryEntries.transactionId],
    references: [transactions.id],
  }),
}));

export const sipsRelations = relations(sips, ({ one, many }) => ({
  mfHolding: one(mfHoldings, {
    fields: [sips.mfHoldingId],
    references: [mfHoldings.id],
  }),
  installments: many(sipInstallments),
}));

export const sipInstallmentsRelations = relations(sipInstallments, ({ one }) => ({
  sip: one(sips, { fields: [sipInstallments.sipId], references: [sips.id] }),
  transaction: one(transactions, {
    fields: [sipInstallments.transactionId],
    references: [transactions.id],
  }),
}));

export const stockHoldingsRelations = relations(stockHoldings, ({ one }) => ({
  dematAccount: one(accounts, {
    fields: [stockHoldings.dematAccountId],
    references: [accounts.id],
  }),
}));

export const creditCardBillsRelations = relations(creditCardBills, ({ one }) => ({
  account: one(accounts, {
    fields: [creditCardBills.accountId],
    references: [accounts.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  linkedAccount: one(accounts, {
    fields: [documents.linkedAccountId],
    references: [accounts.id],
  }),
  transactions: many(transactions),
}));

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [chatMessages.conversationId],
    references: [conversations.id],
  }),
}));

// ── Row types ──────────────────────────────────────────────────────────────

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type BalanceSnapshot = typeof balanceSnapshots.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type SalaryEntry = typeof salaryEntries.$inferSelect;
export type NewSalaryEntry = typeof salaryEntries.$inferInsert;
export type Sip = typeof sips.$inferSelect;
export type SipInstallment = typeof sipInstallments.$inferSelect;
export type MfHolding = typeof mfHoldings.$inferSelect;
export type StockHolding = typeof stockHoldings.$inferSelect;
export type CreditCardBill = typeof creditCardBills.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Loan = typeof loans.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type AiDigest = typeof aiDigests.$inferSelect;
