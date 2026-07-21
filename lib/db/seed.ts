/**
 * Idempotent seed: wipes and refills all tables with realistic sample data.
 * Run with: pnpm db:seed
 */
import { getDb } from "./index";
import { dedupeHash } from "./dedupe";
import {
  accounts,
  aiDigests,
  assets,
  balanceSnapshots,
  budgets,
  categories,
  chatMessages,
  conversations,
  creditCardBills,
  documents,
  goals,
  loans,
  mfHoldings,
  salaryEntries,
  sipInstallments,
  sips,
  stockHoldings,
  transactions,
} from "./schema";

const P = (rupees: number) => Math.round(rupees * 100);

const DEFAULT_CATEGORIES: {
  name: string;
  kind: "income" | "expense";
  icon: string;
  color: string;
}[] = [
  { name: "Food & Dining", kind: "expense", icon: "utensils", color: "#f97316" },
  { name: "Groceries", kind: "expense", icon: "shopping-basket", color: "#84cc16" },
  { name: "Rent", kind: "expense", icon: "home", color: "#0ea5e9" },
  { name: "Utilities", kind: "expense", icon: "plug", color: "#eab308" },
  { name: "Transport", kind: "expense", icon: "car", color: "#8b5cf6" },
  { name: "Shopping", kind: "expense", icon: "shopping-bag", color: "#ec4899" },
  { name: "Entertainment", kind: "expense", icon: "clapperboard", color: "#f43f5e" },
  { name: "Health", kind: "expense", icon: "heart-pulse", color: "#10b981" },
  { name: "Travel", kind: "expense", icon: "plane", color: "#06b6d4" },
  { name: "EMI", kind: "expense", icon: "landmark", color: "#64748b" },
  { name: "Insurance", kind: "expense", icon: "shield", color: "#3b82f6" },
  { name: "Subscriptions", kind: "expense", icon: "repeat", color: "#a855f7" },
  { name: "Investment", kind: "expense", icon: "trending-up", color: "#22c55e" },
  { name: "Fees & Charges", kind: "expense", icon: "receipt", color: "#78716c" },
  { name: "Other", kind: "expense", icon: "circle-ellipsis", color: "#9ca3af" },
  { name: "Salary", kind: "income", icon: "briefcase", color: "#22c55e" },
  { name: "Interest", kind: "income", icon: "percent", color: "#14b8a6" },
  { name: "Dividend", kind: "income", icon: "coins", color: "#f59e0b" },
  { name: "Refund", kind: "income", icon: "rotate-ccw", color: "#60a5fa" },
  { name: "Other Income", kind: "income", icon: "plus-circle", color: "#9ca3af" },
];

/** Months relative to now: 0 = current month, -1 = last month… as YYYY-MM */
function month(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function seed() {
  const db = getDb();

  console.log("Clearing existing data…");
  await db.delete(aiDigests);
  await db.delete(budgets);
  await db.delete(goals);
  await db.delete(assets);
  await db.delete(loans);
  await db.delete(chatMessages);
  await db.delete(conversations);
  await db.delete(sipInstallments);
  await db.delete(sips);
  await db.delete(salaryEntries);
  await db.delete(creditCardBills);
  await db.delete(transactions);
  await db.delete(documents);
  await db.delete(stockHoldings);
  await db.delete(mfHoldings);
  await db.delete(balanceSnapshots);
  await db.delete(categories);
  await db.delete(accounts);

  console.log("Seeding categories…");
  const cats = await db.insert(categories).values(
    DEFAULT_CATEGORIES.map((c) => ({ ...c, isDefault: true })),
  ).returning();
  const cat = (name: string) => {
    const found = cats.find((c) => c.name === name);
    if (!found) throw new Error(`missing category ${name}`);
    return found.id;
  };

  console.log("Seeding accounts…");
  const [hdfc, icici, amexCard, zerodha, cash] = await db
    .insert(accounts)
    .values([
      {
        name: "HDFC Salary Account",
        type: "bank" as const,
        institution: "HDFC Bank",
        last4: "4521",
        currentBalancePaise: P(284_350),
      },
      {
        name: "ICICI Savings",
        type: "bank" as const,
        institution: "ICICI Bank",
        last4: "8890",
        currentBalancePaise: P(1_52_000),
      },
      {
        name: "Amex Platinum Travel",
        type: "credit_card" as const,
        institution: "American Express",
        last4: "1005",
        creditLimitPaise: P(5_00_000),
        billDueDay: 8,
      },
      {
        name: "Zerodha Demat",
        type: "demat" as const,
        institution: "Zerodha",
        last4: "ZR01",
      },
      {
        name: "Cash",
        type: "cash" as const,
        currentBalancePaise: P(6_500),
      },
    ])
    .returning();

  console.log("Seeding balance snapshots…");
  const snapshotRows = [];
  for (let m = -5; m <= 0; m++) {
    const asOf = `${month(m)}-25`;
    snapshotRows.push(
      { accountId: hdfc.id, balancePaise: P(190_000 + (m + 5) * 19_000), asOf },
      { accountId: icici.id, balancePaise: P(1_20_000 + (m + 5) * 6_500), asOf },
    );
  }
  await db.insert(balanceSnapshots).values(snapshotRows);

  console.log("Seeding transactions (3 months)…");
  const txnTemplates: {
    monthOffset: number;
    day: number;
    account: string;
    type: "income" | "expense";
    amount: number;
    description: string;
    merchant?: string;
    category: string;
  }[] = [];

  for (const m of [-2, -1, 0]) {
    txnTemplates.push(
      { monthOffset: m, day: 1, account: hdfc.id, type: "income", amount: 1_42_500, description: "Salary credit — NEFT ACME TECH", category: "Salary" },
      { monthOffset: m, day: 2, account: hdfc.id, type: "expense", amount: 32_000, description: "Rent transfer — UPI landlord", category: "Rent" },
      { monthOffset: m, day: 3, account: hdfc.id, type: "expense", amount: 4_500, description: "UPI-BIGBASKET groceries", merchant: "BigBasket", category: "Groceries" },
      { monthOffset: m, day: 5, account: hdfc.id, type: "expense", amount: 1_299, description: "NETFLIX subscription", merchant: "Netflix", category: "Subscriptions" },
      { monthOffset: m, day: 6, account: hdfc.id, type: "expense", amount: 649, description: "SPOTIFY premium", merchant: "Spotify", category: "Subscriptions" },
      { monthOffset: m, day: 7, account: hdfc.id, type: "expense", amount: 2_340, description: "UPI-SWIGGY order", merchant: "Swiggy", category: "Food & Dining" },
      { monthOffset: m, day: 9, account: hdfc.id, type: "expense", amount: 1_850, description: "UPI-ZOMATO order", merchant: "Zomato", category: "Food & Dining" },
      { monthOffset: m, day: 10, account: hdfc.id, type: "expense", amount: 3_200, description: "Electricity bill BESCOM", category: "Utilities" },
      { monthOffset: m, day: 11, account: hdfc.id, type: "expense", amount: 999, description: "Airtel postpaid", merchant: "Airtel", category: "Utilities" },
      { monthOffset: m, day: 12, account: hdfc.id, type: "expense", amount: 5_600, description: "UPI-UBER rides", merchant: "Uber", category: "Transport" },
      { monthOffset: m, day: 14, account: hdfc.id, type: "expense", amount: 8_900, description: "AMAZON.IN purchase", merchant: "Amazon", category: "Shopping" },
      { monthOffset: m, day: 15, account: hdfc.id, type: "expense", amount: 1_200, description: "BOOKMYSHOW tickets", merchant: "BookMyShow", category: "Entertainment" },
      { monthOffset: m, day: 16, account: hdfc.id, type: "expense", amount: 2_500, description: "Apollo pharmacy", merchant: "Apollo", category: "Health" },
      { monthOffset: m, day: 18, account: hdfc.id, type: "expense", amount: 3_400, description: "UPI-SWIGGY INSTAMART", merchant: "Swiggy Instamart", category: "Groceries" },
      { monthOffset: m, day: 20, account: hdfc.id, type: "expense", amount: 21_990, description: "LIC premium autopay", category: "Insurance" },
      { monthOffset: m, day: 25, account: icici.id, type: "income", amount: 1_875, description: "Savings interest credit", category: "Interest" },
      { monthOffset: m, day: 26, account: hdfc.id, type: "expense", amount: 4_100, description: "Petrol — Indian Oil", category: "Transport" },
      { monthOffset: m, day: 27, account: hdfc.id, type: "expense", amount: 6_750, description: "Weekend dining — Toit", merchant: "Toit", category: "Food & Dining" },
    );
  }

  await db.insert(transactions).values(
    txnTemplates.map((t) => {
      const date = `${month(t.monthOffset)}-${String(t.day).padStart(2, "0")}`;
      const amountPaise = P(t.amount);
      return {
        accountId: t.account,
        type: t.type,
        amountPaise,
        date,
        description: t.description,
        merchant: t.merchant,
        categoryId: cat(t.category),
        source: "manual" as const,
        dedupeHash: dedupeHash(t.account, date, amountPaise, t.description),
      };
    }),
  );

  console.log("Seeding salary entries…");
  await db.insert(salaryEntries).values(
    [-1, 0].map((m) => ({
      month: `${month(m)}-01`,
      employer: "Acme Tech Pvt Ltd",
      grossPaise: P(1_80_000),
      netPaise: P(1_42_500),
      basicPaise: P(72_000),
      hraPaise: P(36_000),
      specialAllowancePaise: P(60_000),
      otherEarnings: [{ label: "Internet allowance", amountPaise: P(12_000) }],
      pfPaise: P(8_640),
      professionalTaxPaise: P(200),
      incomeTaxPaise: P(28_660),
      otherDeductions: [],
      creditedAccountId: hdfc.id,
    })),
  );

  console.log("Seeding MF holdings + SIPs…");
  const [ppfas, uti] = await db
    .insert(mfHoldings)
    .values([
      {
        // Invested = 12 monthly ₹10k SIP installments (seeded below), so the
        // dated flow history is complete and XIRR is computable.
        schemeName: "Parag Parikh Flexi Cap Fund Direct-Growth",
        amc: "PPFAS",
        folioNo: "PP1234567",
        holdingKind: "equity" as const,
        units: "1450.2210",
        avgNav: "82.7500",
        investedPaise: P(1_20_000),
        currentNav: "91.2200",
        currentValuePaise: P(1_32_289),
        navAsOf: `${month(0)}-15`,
      },
      {
        // Invested = 18 monthly ₹15k SIP installments (seeded below).
        schemeName: "UTI Nifty 50 Index Fund Direct-Growth",
        amc: "UTI",
        folioNo: "UT7654321",
        holdingKind: "index" as const,
        units: "2210.5500",
        avgNav: "122.1400",
        investedPaise: P(2_70_000),
        currentNav: "170.0100",
        currentValuePaise: P(3_75_816),
        navAsOf: `${month(0)}-15`,
      },
      {
        schemeName: "SBI Liquid Fund Direct-Growth",
        amc: "SBI",
        holdingKind: "liquid" as const,
        units: "35.8000",
        avgNav: "3352.0000",
        investedPaise: P(1_20_000),
        currentNav: "3489.5000",
        currentValuePaise: P(1_24_924),
        navAsOf: `${month(0)}-15`,
      },
    ])
    .returning();

  const [sipPpfas, sipUti] = await db
    .insert(sips)
    .values([
      {
        name: "PPFAS Flexi Cap SIP",
        schemeName: "Parag Parikh Flexi Cap Fund Direct-Growth",
        assetKind: "mutual_fund" as const,
        amountPaise: P(10_000),
        frequency: "monthly" as const,
        dayOfMonth: 5,
        startDate: "2024-06-05",
        mfHoldingId: ppfas.id,
      },
      {
        name: "UTI Nifty Index SIP",
        schemeName: "UTI Nifty 50 Index Fund Direct-Growth",
        assetKind: "mutual_fund" as const,
        amountPaise: P(15_000),
        frequency: "monthly" as const,
        dayOfMonth: 10,
        startDate: "2023-11-10",
        mfHoldingId: uti.id,
      },
    ])
    .returning();

  // Paid history matches each holding's investedPaise (12 × ₹10k, 18 × ₹15k)
  // so per-holding XIRR has a complete dated flow history.
  const installmentRows = [];
  for (const [sip, day, monthsPaid] of [
    [sipPpfas, 5, 12],
    [sipUti, 10, 18],
  ] as const) {
    for (let m = -(monthsPaid - 1); m <= 0; m++) {
      installmentRows.push({
        sipId: sip.id,
        dueDate: `${month(m)}-${String(day).padStart(2, "0")}`,
        amountPaise: sip.amountPaise,
        status: "paid" as const,
      });
    }
    installmentRows.push({
      sipId: sip.id,
      dueDate: `${month(1)}-${String(day).padStart(2, "0")}`,
      amountPaise: sip.amountPaise,
      status: "upcoming" as const,
    });
  }
  await db.insert(sipInstallments).values(installmentRows);

  console.log("Seeding stock holdings…");
  await db.insert(stockHoldings).values([
    {
      dematAccountId: zerodha.id,
      ticker: "RELIANCE",
      exchange: "NSE" as const,
      companyName: "Reliance Industries",
      quantity: "24.00",
      avgPricePaise: P(2_450),
      investedPaise: P(58_800),
      currentPricePaise: P(2_985),
      currentValuePaise: P(71_640),
      priceAsOf: `${month(0)}-15`,
    },
    {
      dematAccountId: zerodha.id,
      ticker: "TCS",
      exchange: "NSE" as const,
      companyName: "Tata Consultancy Services",
      quantity: "12.00",
      avgPricePaise: P(3_610),
      investedPaise: P(43_320),
      currentPricePaise: P(4_120),
      currentValuePaise: P(49_440),
      priceAsOf: `${month(0)}-15`,
    },
  ]);

  console.log("Seeding credit card bill…");
  await db.insert(creditCardBills).values([
    {
      accountId: amexCard.id,
      periodStart: `${month(-1)}-16`,
      periodEnd: `${month(0)}-15`,
      statementDate: `${month(0)}-16`,
      dueDate: `${month(1)}-08`,
      totalDuePaise: P(38_450),
      minDuePaise: P(1_925),
      status: "unpaid" as const,
    },
    {
      accountId: amexCard.id,
      periodStart: `${month(-2)}-16`,
      periodEnd: `${month(-1)}-15`,
      statementDate: `${month(-1)}-16`,
      dueDate: `${month(0)}-08`,
      totalDuePaise: P(29_310),
      minDuePaise: P(1_465),
      status: "paid" as const,
      paidPaise: P(29_310),
      paidDate: `${month(0)}-05`,
    },
  ]);

  console.log("Seeding budgets, goals, assets, loan…");
  await db.insert(budgets).values(
    (
      [
        ["Food & Dining", 12_000],
        ["Groceries", 10_000],
        ["Shopping", 10_000],
        ["Entertainment", 3_000],
        ["Transport", 8_000],
      ] as const
    ).map(([name, limit]) => ({ categoryId: cat(name), monthlyLimitPaise: P(limit) })),
  );

  await db.insert(goals).values([
    {
      name: "Emergency fund",
      targetPaise: P(6_00_000),
      savedPaise: P(2_40_000),
      notes: "6 months of expenses",
    },
    {
      name: "Goa trip",
      targetPaise: P(80_000),
      savedPaise: P(15_000),
      targetDate: `${month(6)}-15`,
    },
  ]);

  await db.insert(assets).values([
    { name: "EPF balance", kind: "epf" as const, valuePaise: P(3_85_000) },
    {
      name: "SBI Fixed Deposit",
      kind: "fd" as const,
      valuePaise: P(2_00_000),
      institution: "SBI",
      annualRatePct: "7.10",
      maturityDate: `${month(11)}-01`,
    },
    { name: "Gold (digital + coins)", kind: "gold" as const, valuePaise: P(1_50_000) },
  ]);

  await db.insert(loans).values([
    {
      name: "Car loan",
      lender: "HDFC Bank",
      principalPaise: P(6_00_000),
      annualRatePct: "9.20",
      emiPaise: P(12_520),
      startDate: "2025-03-01",
      tenureMonths: 60,
    },
  ]);

  console.log("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
