import { NextResponse } from "next/server";
import { isApiAuthenticated } from "@/lib/auth/guard";
import { ensureWeeklyDigest } from "@/lib/ai/digest";

export const maxDuration = 60;

/** Valid app session OR the Vercel cron secret. */
async function isAuthorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) {
    return true;
  }
  return isApiAuthenticated();
}

function forceFromQuery(req: Request): boolean {
  const v = new URL(req.url).searchParams.get("force");
  return v === "true" || v === "1";
}

async function handle(req: Request, force: boolean): Promise<NextResponse> {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.log(
    JSON.stringify({ level: "info", msg: "weekly-digest-cron", force }),
  );
  const { generated } = await ensureWeeklyDigest({ force });
  return NextResponse.json({ generated });
}

export async function GET(req: Request) {
  return handle(req, forceFromQuery(req));
}

export async function POST(req: Request) {
  let force = forceFromQuery(req);
  try {
    const body = (await req.json()) as { force?: unknown };
    if (body?.force === true) force = true;
  } catch {
    // No/invalid JSON body — fall back to the query param.
  }
  return handle(req, force);
}
