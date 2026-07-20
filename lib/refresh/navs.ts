import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { mfHoldings, stockHoldings } from "@/lib/db/schema";
import { todayIST } from "@/lib/utils/dates";

// ── Market-data refresh ─────────────────────────────────────────────────────
// MF NAVs come from AMFI's daily NAVAll.txt dump; stock prices from Yahoo
// Finance's keyless chart API. All money is written back as integer paise.

const AMFI_URL = "https://www.amfiindia.com/spages/NAVAll.txt";
const AMFI_TIMEOUT_MS = 30_000;
const YAHOO_TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// ── AMFI parsing & scheme-name matching ─────────────────────────────────────

type AmfiScheme = {
  schemeName: string;
  nav: number;
  tokens: Set<string>;
  /** Normalized name (sorted unique tokens joined by spaces). */
  joined: string;
};

type AmfiData = {
  byIsin: Map<string, { schemeName: string; nav: number }>;
  schemes: AmfiScheme[];
};

// Words that carry no identity ("fund", "plan", …). Plan variants such as
// "direct" / "regular" / "growth" / "idcw" are deliberately kept — they are
// what distinguishes the multiple AMFI rows of the same scheme.
const NOISE_WORDS = new Set([
  "fund",
  "funds",
  "plan",
  "plans",
  "option",
  "options",
  "scheme",
  "schemes",
  "the",
  "of",
  "and",
  "an",
  "a",
]);

/** Lowercase, strip punctuation, drop noise words → sorted unique tokens. */
function normalizeTokens(name: string): string[] {
  return [
    ...new Set(
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter((t) => t.length > 0 && !NOISE_WORDS.has(t)),
    ),
  ].sort();
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  if (a.size > b.size) return false;
  for (const t of a) if (!b.has(t)) return false;
  return true;
}

/**
 * Parse AMFI NAVAll.txt. Data lines look like:
 * `Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date`
 * Section headers, AMC names, and blank lines are skipped.
 */
function parseAmfi(text: string): AmfiData {
  const byIsin = new Map<string, { schemeName: string; nav: number }>();
  const schemes: AmfiScheme[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const parts = rawLine.split(";");
    if (parts.length < 6) continue;
    const code = parts[0].trim();
    if (!/^\d+$/.test(code)) continue;
    const schemeName = parts[3].trim();
    const nav = Number(parts[4].trim());
    if (!schemeName || !Number.isFinite(nav) || nav <= 0) continue;
    for (const isin of [parts[1].trim(), parts[2].trim()]) {
      if (isin && isin !== "-") byIsin.set(isin, { schemeName, nav });
    }
    const tokens = normalizeTokens(schemeName);
    schemes.push({ schemeName, nav, tokens: new Set(tokens), joined: tokens.join(" ") });
  }
  return { byIsin, schemes };
}

/**
 * Fuzzy scheme-name match: after normalization, one name's tokens must be a
 * subset of the other's (word order in AMFI names is inconsistent, e.g.
 * "… - Growth Option- Direct"), and the longer normalized name must be
 * ≥ 15 chars to avoid false positives on short names. When several AMFI rows
 * qualify (e.g. "Nifty 50" vs "Nifty Next 50"), an exact normalized match
 * wins; otherwise the holding is skipped as ambiguous.
 */
function matchByName(
  holdingName: string,
  schemes: AmfiScheme[],
): { scheme: AmfiScheme } | { error: string } {
  const tokens = normalizeTokens(holdingName);
  const tokenSet = new Set(tokens);
  const joined = tokens.join(" ");
  const candidates = schemes.filter(
    (s) =>
      Math.max(joined.length, s.joined.length) >= 15 &&
      (isSubset(tokenSet, s.tokens) || isSubset(s.tokens, tokenSet)),
  );
  if (candidates.length === 0) return { error: `no AMFI match for "${holdingName}"` };
  if (candidates.length === 1) return { scheme: candidates[0] };
  const exact = candidates.filter((s) => s.joined === joined);
  if (exact.length === 1) return { scheme: exact[0] };
  const examples = candidates
    .slice(0, 3)
    .map((c) => `"${c.schemeName}"`)
    .join(", ");
  return {
    error: `ambiguous AMFI match for "${holdingName}" (${candidates.length} candidates: ${examples}${candidates.length > 3 ? ", …" : ""})`,
  };
}

// ── Yahoo Finance ───────────────────────────────────────────────────────────

type YahooChartResponse = {
  chart?: {
    result?: Array<{ meta?: { regularMarketPrice?: unknown } }>;
    error?: { description?: string } | null;
  };
};

async function fetchYahooPrice(symbol: string): Promise<number> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const res = await fetchWithTimeout(url, YAHOO_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Yahoo responded ${res.status} for ${symbol}`);
  const data = (await res.json()) as YahooChartResponse;
  if (data.chart?.error) {
    throw new Error(`Yahoo error for ${symbol}: ${data.chart.error.description ?? "unknown"}`);
  }
  const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    throw new Error(`Yahoo returned no price for ${symbol}`);
  }
  return price;
}

// ── Main refresh ────────────────────────────────────────────────────────────

export async function refreshAllNavs(): Promise<{
  mfUpdated: number;
  stocksUpdated: number;
  errors: string[];
}> {
  const start = Date.now();
  const errors: string[] = [];
  let mfUpdated = 0;
  let stocksUpdated = 0;
  const db = getDb();
  const asOf = todayIST();
  console.log(JSON.stringify({ level: "info", msg: "refresh-navs-start" }));

  try {
    // ── Mutual fund NAVs (AMFI) ─────────────────────────────────────────────
    const holdings = await db.select().from(mfHoldings);
    if (holdings.length > 0) {
      let amfi: AmfiData | null = null;
      try {
        const res = await fetchWithTimeout(AMFI_URL, AMFI_TIMEOUT_MS);
        if (!res.ok) throw new Error(`AMFI responded ${res.status}`);
        amfi = parseAmfi(await res.text());
        if (amfi.schemes.length === 0) throw new Error("AMFI feed parsed to zero schemes");
      } catch (err) {
        errors.push(
          `AMFI fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (amfi) {
        for (const holding of holdings) {
          try {
            let nav: number | null = null;
            if (holding.isin) {
              const byIsin = amfi.byIsin.get(holding.isin.trim());
              if (byIsin) nav = byIsin.nav;
            }
            if (nav === null) {
              // No ISIN (or ISIN absent from the feed) — fall back to name match.
              const match = matchByName(holding.schemeName, amfi.schemes);
              if ("error" in match) {
                errors.push(match.error);
                continue;
              }
              nav = match.scheme.nav;
            }
            await db
              .update(mfHoldings)
              .set({
                currentNav: nav.toFixed(4),
                currentValuePaise: Math.round(Number(holding.units) * nav * 100),
                navAsOf: asOf,
                updatedAt: new Date(),
              })
              .where(eq(mfHoldings.id, holding.id));
            mfUpdated++;
          } catch (err) {
            errors.push(
              `MF update failed for "${holding.schemeName}": ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
    }

    // ── Stock prices (Yahoo Finance) ────────────────────────────────────────
    const stocks = await db.select().from(stockHoldings);
    for (const stock of stocks) {
      const symbol = `${stock.ticker}.${stock.exchange === "BSE" ? "BO" : "NS"}`;
      try {
        const price = await fetchYahooPrice(symbol);
        await db
          .update(stockHoldings)
          .set({
            currentPricePaise: Math.round(price * 100),
            currentValuePaise: Math.round(Number(stock.quantity) * price * 100),
            priceAsOf: asOf,
            updatedAt: new Date(),
          })
          .where(eq(stockHoldings.id, stock.id));
        stocksUpdated++;
      } catch (err) {
        errors.push(
          `Stock update failed for ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    console.log(
      JSON.stringify({
        level: "info",
        msg: "refresh-navs-done",
        mfUpdated,
        stocksUpdated,
        errorCount: errors.length,
        ms: Date.now() - start,
      }),
    );
    return { mfUpdated, stocksUpdated, errors };
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "refresh-navs-failed",
        error: err instanceof Error ? err.message : String(err),
        ms: Date.now() - start,
      }),
    );
    throw err;
  }
}
