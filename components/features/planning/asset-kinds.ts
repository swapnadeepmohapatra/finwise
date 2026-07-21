import type { Asset } from "@/lib/db/schema";

/** Display labels for asset kinds, in the order sections/selects render. */
export const ASSET_KIND_LABELS: Record<Asset["kind"], string> = {
  epf: "EPF",
  ppf: "PPF",
  nps: "NPS",
  fd: "Fixed deposit",
  rd: "Recurring deposit",
  gold: "Gold",
  real_estate: "Real estate",
  other: "Other",
};

export const ASSET_KINDS = Object.keys(ASSET_KIND_LABELS) as Asset["kind"][];
