import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { isApiAuthenticated } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { todayIST } from "@/lib/utils/dates";

function csvCell(value: string | null | undefined): string {
  const s = value ?? "";
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  if (!(await isApiAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await getDb().query.transactions.findMany({
    with: { account: true, category: true, counterAccount: true },
    orderBy: [desc(transactions.date), desc(transactions.createdAt)],
  });

  const header =
    "Date,Type,Amount (INR),Description,Merchant,Category,Account,Counter Account,Notes,Source";
  const lines = rows.map((t) =>
    [
      t.date,
      t.type,
      (t.amountPaise / 100).toFixed(2),
      csvCell(t.description),
      csvCell(t.merchant),
      csvCell(t.category?.name),
      csvCell(t.account.name),
      csvCell(t.counterAccount?.name),
      csvCell(t.notes),
      t.source,
    ].join(","),
  );

  return new NextResponse([header, ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finwise-transactions-${todayIST()}.csv"`,
    },
  });
}
