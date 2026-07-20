import { createHash } from "crypto";

/** Stable hash to flag likely-duplicate transactions during imports. */
export function dedupeHash(
  accountId: string,
  date: string,
  amountPaise: number,
  description: string,
): string {
  const normalized = description.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256")
    .update(`${accountId}|${date}|${amountPaise}|${normalized}`)
    .digest("hex");
}
