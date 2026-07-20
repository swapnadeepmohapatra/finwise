import { z } from "zod";

// All amounts in these schemas are RUPEES as plain numbers (LLM-friendly).
// They are converted to integer paise in commitExtraction.

const isoDate = z
  .string()
  .describe("ISO date YYYY-MM-DD (convert DD/MM/YYYY Indian format)");

export const extractedTxnSchema = z.object({
  date: isoDate,
  description: z.string().describe("Transaction description as printed"),
  merchant: z
    .string()
    .nullish()
    .describe("Merchant/payee name if identifiable (e.g. Swiggy, Amazon)"),
  refNo: z.string().nullish().describe("Reference/UTR number if present"),
  direction: z
    .enum(["credit", "debit"])
    .describe("credit = money in, debit = money out"),
  amount: z.number().positive().describe("Amount in rupees, always positive"),
  suggestedCategory: z
    .string()
    .nullish()
    .describe(
      "Best-fit category from: Food & Dining, Groceries, Rent, Utilities, Transport, Shopping, Entertainment, Health, Travel, EMI, Insurance, Subscriptions, Investment, Fees & Charges, Other, Salary, Interest, Dividend, Refund, Other Income",
    ),
});

export const bankStatementSchema = z.object({
  bankName: z.string().nullish(),
  accountLast4: z.string().nullish().describe("Last 4 digits of account number"),
  periodFrom: isoDate.nullish(),
  periodTo: isoDate.nullish(),
  openingBalance: z.number().nullish().describe("Opening balance in rupees"),
  closingBalance: z.number().nullish().describe("Closing balance in rupees"),
  transactions: z.array(extractedTxnSchema),
});

export const ccStatementSchema = z.object({
  issuer: z.string().nullish(),
  cardLast4: z.string().nullish(),
  statementDate: isoDate.nullish(),
  dueDate: isoDate.nullish(),
  periodFrom: isoDate.nullish(),
  periodTo: isoDate.nullish(),
  totalDue: z.number().nullish().describe("Total amount due in rupees"),
  minDue: z.number().nullish().describe("Minimum amount due in rupees"),
  transactions: z.array(extractedTxnSchema),
});

const labeledAmount = z.object({
  label: z.string(),
  amount: z.number().describe("Amount in rupees"),
});

export const payslipSchema = z.object({
  employer: z.string().nullish(),
  payPeriodMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .describe("Pay period as YYYY-MM"),
  gross: z.number().describe("Gross earnings in rupees"),
  net: z.number().describe("Net pay / take-home in rupees"),
  earnings: z.object({
    basic: z.number().nullish(),
    hra: z.number().nullish().describe("House Rent Allowance"),
    specialAllowance: z.number().nullish(),
    others: z.array(labeledAmount).default([]),
  }),
  deductions: z.object({
    pf: z.number().nullish().describe("Provident Fund (EPF) employee contribution"),
    professionalTax: z.number().nullish(),
    incomeTax: z.number().nullish().describe("TDS / income tax"),
    others: z.array(labeledAmount).default([]),
  }),
});

export type ExtractedTxn = z.infer<typeof extractedTxnSchema>;
export type BankStatementExtraction = z.infer<typeof bankStatementSchema>;
export type CcStatementExtraction = z.infer<typeof ccStatementSchema>;
export type PayslipExtraction = z.infer<typeof payslipSchema>;

export type ExtractionResult =
  | { docType: "bank_statement"; data: BankStatementExtraction }
  | { docType: "credit_card_statement"; data: CcStatementExtraction }
  | { docType: "payslip"; data: PayslipExtraction };

export function schemaForDocType(docType: string) {
  switch (docType) {
    case "bank_statement":
      return bankStatementSchema;
    case "credit_card_statement":
      return ccStatementSchema;
    case "payslip":
      return payslipSchema;
    default:
      return null;
  }
}
