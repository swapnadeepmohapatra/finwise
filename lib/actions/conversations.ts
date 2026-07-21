"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/guard";

export async function deleteConversation(id: string) {
  await requireSession();
  await getDb().delete(conversations).where(eq(conversations.id, id));
  revalidatePath("/advisor");
}

export async function renameConversation(id: string, title: string) {
  await requireSession();
  const trimmed = title.trim().slice(0, 60);
  if (!trimmed) return;
  await getDb()
    .update(conversations)
    .set({ title: trimmed })
    .where(eq(conversations.id, id));
  revalidatePath("/advisor");
}
