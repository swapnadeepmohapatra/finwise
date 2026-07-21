"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/guard";
import { parseINRToPaise } from "@/lib/utils/money";
import type { ActionState } from "./accounts";

const assetSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  kind: z.enum(["epf", "ppf", "nps", "fd", "rd", "gold", "real_estate", "other"]),
  value: z.string().trim().min(1, "Value is required"),
  institution: z.string().trim().optional(),
  maturityDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid maturity date")
    .optional(),
  annualRatePct: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, "Invalid interest rate")
    .optional(),
  notes: z.string().trim().optional(),
});

function revalidateAssetPages() {
  revalidatePath("/planning/assets");
  revalidatePath("/");
}

function parseAsset(formData: FormData) {
  const parsed = assetSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    value: formData.get("value"),
    institution: formData.get("institution") || undefined,
    maturityDate: formData.get("maturityDate") || undefined,
    annualRatePct: formData.get("annualRatePct") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const v = parsed.data;

  const valuePaise = parseINRToPaise(v.value);
  if (valuePaise === null || valuePaise < 0) return { error: "Invalid value" } as const;

  return {
    values: {
      name: v.name,
      kind: v.kind,
      valuePaise,
      institution: v.institution ?? null,
      maturityDate: v.maturityDate ?? null,
      // numeric column — stored as a normalized string, e.g. "9.20"
      annualRatePct: v.annualRatePct ? Number(v.annualRatePct).toFixed(2) : null,
      notes: v.notes ?? null,
    },
  } as const;
}

export async function createAsset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const result = parseAsset(formData);
  if ("error" in result) return { error: result.error };
  await getDb().insert(assets).values(result.values);
  revalidateAssetPages();
  return { success: true };
}

export async function updateAsset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing asset id" };
  const result = parseAsset(formData);
  if ("error" in result) return { error: result.error };
  await getDb()
    .update(assets)
    .set({ ...result.values, updatedAt: new Date() })
    .where(eq(assets.id, id));
  revalidateAssetPages();
  return { success: true };
}

/** Quick update of just the current value (from the "Update value" dialog). */
export async function updateAssetValue(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  const id = formData.get("id");
  const valueRaw = formData.get("value");
  if (typeof id !== "string" || !id) return { error: "Missing asset id" };
  if (typeof valueRaw !== "string" || !valueRaw.trim())
    return { error: "Value is required" };
  const valuePaise = parseINRToPaise(valueRaw);
  if (valuePaise === null || valuePaise < 0) return { error: "Invalid value" };

  await getDb()
    .update(assets)
    .set({ valuePaise, updatedAt: new Date() })
    .where(eq(assets.id, id));
  revalidateAssetPages();
  return { success: true };
}

export async function deleteAsset(id: string) {
  await requireSession();
  await getDb().delete(assets).where(eq(assets.id, id));
  revalidateAssetPages();
}
