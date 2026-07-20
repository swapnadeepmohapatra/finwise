"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { mfHoldings, stockHoldings } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/guard";
import { parseINRToPaise } from "@/lib/utils/money";
import { todayIST } from "@/lib/utils/dates";
import type { ActionState } from "./accounts";

const decimalString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "Invalid number");

/** Radix Select posts "none" for the empty option — treat it as unset. */
function optional(formData: FormData, key: string) {
  const value = formData.get(key);
  return value && value !== "none" ? value : undefined;
}

function revalidateInvestments() {
  revalidatePath("/investments");
  revalidatePath("/investments/mutual-funds");
  revalidatePath("/investments/stocks");
  revalidatePath("/investments/sips");
  revalidatePath("/");
}

// ── Mutual fund holdings ───────────────────────────────────────────────────

const mfSchema = z.object({
  schemeName: z.string().trim().min(1, "Scheme name is required"),
  amc: z.string().trim().optional(),
  folioNo: z.string().trim().optional(),
  holdingKind: z.enum(["equity", "debt", "hybrid", "elss", "index", "liquid", "other"]),
  units: decimalString,
  avgNav: decimalString.optional(),
  invested: z.string().trim().min(1, "Invested amount is required"),
  currentNav: decimalString.optional(),
});

function parseMf(formData: FormData) {
  const parsed = mfSchema.safeParse({
    schemeName: formData.get("schemeName"),
    amc: formData.get("amc") || undefined,
    folioNo: formData.get("folioNo") || undefined,
    holdingKind: formData.get("holdingKind"),
    units: formData.get("units"),
    avgNav: formData.get("avgNav") || undefined,
    invested: formData.get("invested"),
    currentNav: formData.get("currentNav") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const v = parsed.data;

  const units = Number(v.units);
  if (!Number.isFinite(units) || units <= 0) return { error: "Invalid units" } as const;
  const investedPaise = parseINRToPaise(v.invested);
  if (investedPaise === null || investedPaise <= 0)
    return { error: "Invalid invested amount" } as const;
  const currentNav = v.currentNav != null ? Number(v.currentNav) : null;
  if (currentNav !== null && (!Number.isFinite(currentNav) || currentNav <= 0))
    return { error: "Invalid current NAV" } as const;

  return {
    values: {
      schemeName: v.schemeName,
      amc: v.amc ?? null,
      folioNo: v.folioNo ?? null,
      holdingKind: v.holdingKind,
      units: v.units,
      avgNav: v.avgNav ?? null,
      investedPaise,
      currentNav: v.currentNav ?? null,
      currentValuePaise: currentNav !== null ? Math.round(units * currentNav * 100) : null,
      navAsOf: currentNav !== null ? todayIST() : null,
    },
  } as const;
}

export async function createMfHolding(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const result = parseMf(formData);
  if ("error" in result) return { error: result.error };
  await getDb().insert(mfHoldings).values(result.values);
  revalidateInvestments();
  return { success: true };
}

export async function updateMfHolding(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing holding id" };
  const result = parseMf(formData);
  if ("error" in result) return { error: result.error };
  await getDb()
    .update(mfHoldings)
    .set({ ...result.values, updatedAt: new Date() })
    .where(eq(mfHoldings.id, id));
  revalidateInvestments();
  return { success: true };
}

export async function deleteMfHolding(id: string) {
  await requireSession();
  await getDb().delete(mfHoldings).where(eq(mfHoldings.id, id));
  revalidateInvestments();
}

export async function updateMfNav(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  const navRaw = formData.get("currentNav");
  if (typeof id !== "string" || !id) return { error: "Missing holding id" };
  if (typeof navRaw !== "string" || !navRaw.trim())
    return { error: "Current NAV is required" };
  const nav = Number(navRaw.trim());
  if (!Number.isFinite(nav) || nav <= 0) return { error: "Invalid NAV" };

  const db = getDb();
  const holding = await db.query.mfHoldings.findFirst({
    where: eq(mfHoldings.id, id),
  });
  if (!holding) return { error: "Holding not found" };

  await db
    .update(mfHoldings)
    .set({
      currentNav: String(nav),
      currentValuePaise: Math.round(Number(holding.units) * nav * 100),
      navAsOf: todayIST(),
      updatedAt: new Date(),
    })
    .where(eq(mfHoldings.id, id));
  revalidateInvestments();
  return { success: true };
}

// ── Stock holdings ─────────────────────────────────────────────────────────

const stockSchema = z.object({
  ticker: z.string().trim().min(1, "Ticker is required"),
  exchange: z.enum(["NSE", "BSE"]),
  companyName: z.string().trim().optional(),
  dematAccountId: z.string().uuid().optional(),
  quantity: decimalString,
  avgPrice: z.string().trim().min(1, "Avg price is required"),
  invested: z.string().trim().optional(),
  currentPrice: z.string().trim().optional(),
});

function parseStock(formData: FormData) {
  const parsed = stockSchema.safeParse({
    ticker: formData.get("ticker"),
    exchange: formData.get("exchange"),
    companyName: formData.get("companyName") || undefined,
    dematAccountId: optional(formData, "dematAccountId"),
    quantity: formData.get("quantity"),
    avgPrice: formData.get("avgPrice"),
    invested: formData.get("invested") || undefined,
    currentPrice: formData.get("currentPrice") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const v = parsed.data;

  const quantity = Number(v.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0)
    return { error: "Invalid quantity" } as const;
  const avgPricePaise = parseINRToPaise(v.avgPrice);
  if (avgPricePaise === null || avgPricePaise <= 0)
    return { error: "Invalid avg price" } as const;

  let investedPaise: number;
  if (v.invested) {
    const parsedInvested = parseINRToPaise(v.invested);
    if (parsedInvested === null || parsedInvested <= 0)
      return { error: "Invalid invested amount" } as const;
    investedPaise = parsedInvested;
  } else {
    investedPaise = Math.round(quantity * avgPricePaise);
  }

  let currentPricePaise: number | null = null;
  if (v.currentPrice) {
    currentPricePaise = parseINRToPaise(v.currentPrice);
    if (currentPricePaise === null || currentPricePaise <= 0)
      return { error: "Invalid current price" } as const;
  }

  return {
    values: {
      ticker: v.ticker.toUpperCase(),
      exchange: v.exchange,
      companyName: v.companyName ?? null,
      dematAccountId: v.dematAccountId ?? null,
      quantity: v.quantity,
      avgPricePaise,
      investedPaise,
      currentPricePaise,
      currentValuePaise:
        currentPricePaise !== null ? Math.round(quantity * currentPricePaise) : null,
      priceAsOf: currentPricePaise !== null ? todayIST() : null,
    },
  } as const;
}

export async function createStockHolding(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const result = parseStock(formData);
  if ("error" in result) return { error: result.error };
  await getDb().insert(stockHoldings).values(result.values);
  revalidateInvestments();
  return { success: true };
}

export async function updateStockHolding(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing holding id" };
  const result = parseStock(formData);
  if ("error" in result) return { error: result.error };
  await getDb()
    .update(stockHoldings)
    .set({ ...result.values, updatedAt: new Date() })
    .where(eq(stockHoldings.id, id));
  revalidateInvestments();
  return { success: true };
}

export async function deleteStockHolding(id: string) {
  await requireSession();
  await getDb().delete(stockHoldings).where(eq(stockHoldings.id, id));
  revalidateInvestments();
}

export async function updateStockPrice(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  const priceRaw = formData.get("currentPrice");
  if (typeof id !== "string" || !id) return { error: "Missing holding id" };
  if (typeof priceRaw !== "string" || !priceRaw.trim())
    return { error: "Current price is required" };
  const currentPricePaise = parseINRToPaise(priceRaw);
  if (currentPricePaise === null || currentPricePaise <= 0)
    return { error: "Invalid price" };

  const db = getDb();
  const holding = await db.query.stockHoldings.findFirst({
    where: eq(stockHoldings.id, id),
  });
  if (!holding) return { error: "Holding not found" };

  await db
    .update(stockHoldings)
    .set({
      currentPricePaise,
      currentValuePaise: Math.round(Number(holding.quantity) * currentPricePaise),
      priceAsOf: todayIST(),
      updatedAt: new Date(),
    })
    .where(eq(stockHoldings.id, id));
  revalidateInvestments();
  return { success: true };
}
