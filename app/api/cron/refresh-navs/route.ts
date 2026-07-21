import { NextResponse } from "next/server";
import { isApiAuthenticated } from "@/lib/auth/guard";
import { refreshAllNavs } from "@/lib/refresh/navs";

export const maxDuration = 120;

/** Session cookie (in-app button) OR `Bearer CRON_SECRET` (Vercel cron). */
async function isAuthorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return isApiAuthenticated();
}

async function handle(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await refreshAllNavs();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
