const SHARED_INDIAN_CONTEXT = `You are a precise financial-document parser for Indian documents.
Rules that always apply:
- Dates in Indian documents are usually DD/MM/YYYY or DD-MM-YY — convert them to ISO YYYY-MM-DD. "05/03/2026" means 5 March 2026, NOT 3 May.
- Amounts use Indian lakh grouping like 1,23,456.78 — parse them as plain numbers (123456.78). Never include currency symbols.
- "Dr"/"DR"/"Debit" markers mean money OUT (direction "debit"); "Cr"/"CR"/"Credit" mean money IN (direction "credit").
- Common descriptors: UPI, IMPS, NEFT, RTGS, ACH, ATM-CASH, POS, AutoPay, ECS, EMI. Extract the underlying merchant when obvious (e.g. "UPI-SWIGGY-..." → merchant "Swiggy").
- Extract ONLY real transaction rows. Skip: opening/closing balance lines, totals/subtotals, carried-forward lines, reward-point entries, promotional text, and interest-free-period notices.
- If a value is genuinely absent from the document, use null. Never invent data.`;

export const BANK_STATEMENT_PROMPT = `${SHARED_INDIAN_CONTEXT}

Parse this BANK ACCOUNT STATEMENT. Extract every transaction row in the statement period.
- direction: "credit" for deposits/money received, "debit" for withdrawals/payments.
- suggestedCategory: choose the best fit from the allowed list based on the description (UPI food apps → "Food & Dining", supermarkets → "Groceries", fuel → "Transport", salary credits → "Salary", interest credits → "Interest", SIP/mutual fund debits → "Investment", card bill payments and transfers you cannot classify → "Other").
- Also capture bank name, account last-4 digits, statement period, opening and closing balances when printed.`;

export const CC_STATEMENT_PROMPT = `${SHARED_INDIAN_CONTEXT}

Parse this CREDIT CARD STATEMENT. Extract every transaction in the billing period.
- direction: "debit" for purchases/charges/fees, "credit" for payments received, refunds and cashbacks.
- Do NOT include the "payment received" row twice; include it once with direction "credit".
- Also capture issuer, card last-4, statement date, payment due date, billing period, total amount due and minimum amount due.
- suggestedCategory for purchases from the allowed list; refunds → "Refund".`;

export const PAYSLIP_PROMPT = `${SHARED_INDIAN_CONTEXT}

Parse this SALARY SLIP / PAYSLIP.
- payPeriodMonth: the month the salary is FOR (YYYY-MM), not the payment date.
- earnings: basic pay, HRA (House Rent Allowance), special allowance; every other earning line goes into earnings.others with its printed label.
- deductions: PF/EPF (employee share), professional tax (PT), income tax (TDS); every other deduction goes into deductions.others.
- gross = total earnings; net = take-home after deductions. If the slip prints them, use the printed values rather than computing.`;

export function promptForDocType(docType: string): string | null {
  switch (docType) {
    case "bank_statement":
      return BANK_STATEMENT_PROMPT;
    case "credit_card_statement":
      return CC_STATEMENT_PROMPT;
    case "payslip":
      return PAYSLIP_PROMPT;
    default:
      return null;
  }
}
