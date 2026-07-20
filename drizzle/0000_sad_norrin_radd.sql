CREATE TYPE "public"."account_type" AS ENUM('bank', 'credit_card', 'demat', 'cash', 'wallet');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('unpaid', 'partially_paid', 'paid');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."doc_status" AS ENUM('uploaded', 'extracting', 'extracted', 'committed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."doc_type" AS ENUM('bank_statement', 'credit_card_statement', 'payslip', 'other');--> statement-breakpoint
CREATE TYPE "public"."exchange" AS ENUM('NSE', 'BSE');--> statement-breakpoint
CREATE TYPE "public"."holding_kind" AS ENUM('equity', 'debt', 'hybrid', 'elss', 'index', 'liquid', 'other');--> statement-breakpoint
CREATE TYPE "public"."installment_status" AS ENUM('upcoming', 'paid', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."sip_asset_kind" AS ENUM('mutual_fund', 'stock', 'other');--> statement-breakpoint
CREATE TYPE "public"."sip_frequency" AS ENUM('monthly', 'weekly', 'quarterly');--> statement-breakpoint
CREATE TYPE "public"."txn_source" AS ENUM('manual', 'import');--> statement-breakpoint
CREATE TYPE "public"."txn_type" AS ENUM('income', 'expense', 'transfer');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"institution" text,
	"last4" text,
	"current_balance_paise" bigint,
	"credit_limit_paise" bigint,
	"bill_due_day" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "balance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"balance_paise" bigint NOT NULL,
	"as_of" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "category_kind" NOT NULL,
	"icon" text,
	"color" text,
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"message" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_card_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"statement_date" date NOT NULL,
	"due_date" date NOT NULL,
	"total_due_paise" bigint NOT NULL,
	"min_due_paise" bigint,
	"status" "bill_status" DEFAULT 'unpaid' NOT NULL,
	"paid_paise" bigint DEFAULT 0 NOT NULL,
	"paid_date" date,
	"document_id" uuid
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"blob_url" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"doc_type" "doc_type" NOT NULL,
	"status" "doc_status" DEFAULT 'uploaded' NOT NULL,
	"extraction_json" jsonb,
	"extraction_error" text,
	"linked_account_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"extracted_at" timestamp with time zone,
	"committed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mf_holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheme_name" text NOT NULL,
	"amc" text,
	"folio_no" text,
	"holding_kind" "holding_kind" DEFAULT 'equity' NOT NULL,
	"units" numeric(18, 4) NOT NULL,
	"avg_nav" numeric(18, 4),
	"invested_paise" bigint NOT NULL,
	"current_nav" numeric(18, 4),
	"current_value_paise" bigint,
	"nav_as_of" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" date NOT NULL,
	"employer" text NOT NULL,
	"gross_paise" bigint NOT NULL,
	"net_paise" bigint NOT NULL,
	"basic_paise" bigint,
	"hra_paise" bigint,
	"special_allowance_paise" bigint,
	"other_earnings" jsonb,
	"pf_paise" bigint,
	"professional_tax_paise" bigint,
	"income_tax_paise" bigint,
	"other_deductions" jsonb,
	"credited_account_id" uuid,
	"transaction_id" uuid,
	"document_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_entries_month_unique" UNIQUE("month")
);
--> statement-breakpoint
CREATE TABLE "sip_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sip_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"amount_paise" bigint NOT NULL,
	"units" numeric(18, 4),
	"nav" numeric(18, 4),
	"status" "installment_status" DEFAULT 'upcoming' NOT NULL,
	"transaction_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"scheme_name" text,
	"asset_kind" "sip_asset_kind" DEFAULT 'mutual_fund' NOT NULL,
	"amount_paise" bigint NOT NULL,
	"frequency" "sip_frequency" DEFAULT 'monthly' NOT NULL,
	"day_of_month" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"mf_holding_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"demat_account_id" uuid,
	"ticker" text NOT NULL,
	"exchange" "exchange" DEFAULT 'NSE' NOT NULL,
	"company_name" text,
	"quantity" numeric(14, 2) NOT NULL,
	"avg_price_paise" bigint NOT NULL,
	"invested_paise" bigint NOT NULL,
	"current_price_paise" bigint,
	"current_value_paise" bigint,
	"price_as_of" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"type" "txn_type" NOT NULL,
	"amount_paise" bigint NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"merchant" text,
	"category_id" uuid,
	"counter_account_id" uuid,
	"notes" text,
	"source" "txn_source" DEFAULT 'manual' NOT NULL,
	"document_id" uuid,
	"dedupe_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_bills" ADD CONSTRAINT "credit_card_bills_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_bills" ADD CONSTRAINT "credit_card_bills_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_linked_account_id_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_entries" ADD CONSTRAINT "salary_entries_credited_account_id_accounts_id_fk" FOREIGN KEY ("credited_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_entries" ADD CONSTRAINT "salary_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_entries" ADD CONSTRAINT "salary_entries_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sip_installments" ADD CONSTRAINT "sip_installments_sip_id_sips_id_fk" FOREIGN KEY ("sip_id") REFERENCES "public"."sips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sip_installments" ADD CONSTRAINT "sip_installments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sips" ADD CONSTRAINT "sips_mf_holding_id_mf_holdings_id_fk" FOREIGN KEY ("mf_holding_id") REFERENCES "public"."mf_holdings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_holdings" ADD CONSTRAINT "stock_holdings_demat_account_id_accounts_id_fk" FOREIGN KEY ("demat_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counter_account_id_accounts_id_fk" FOREIGN KEY ("counter_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "balance_snapshots_account_date_idx" ON "balance_snapshots" USING btree ("account_id","as_of");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_idx" ON "chat_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cc_bills_account_statement_idx" ON "credit_card_bills" USING btree ("account_id","statement_date");--> statement-breakpoint
CREATE UNIQUE INDEX "sip_installments_sip_due_idx" ON "sip_installments" USING btree ("sip_id","due_date");--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "transactions_account_date_idx" ON "transactions" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transactions_dedupe_idx" ON "transactions" USING btree ("dedupe_hash");