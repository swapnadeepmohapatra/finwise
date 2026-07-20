import type { Metadata } from "next";
import { Download } from "lucide-react";
import { asc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { CategoryManager } from "@/components/features/settings/category-manager";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const rows = await getDb().select().from(categories).orderBy(asc(categories.name));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Categories</CardTitle>
          <CardDescription>
            Organise your transactions. Defaults are seeded — add your own or
            adjust colors.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryManager categories={rows} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data export</CardTitle>
          <CardDescription>
            Download every transaction as a CSV (opens in Excel/Sheets).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <a href="/api/export/transactions" download>
              <Download className="h-4 w-4" /> Export transactions CSV
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Security</CardTitle>
          <CardDescription>
            Finwise is protected by a single password. To change it, update
            APP_PASSWORD in your .env.local (or Vercel project settings) and
            restart the app.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
