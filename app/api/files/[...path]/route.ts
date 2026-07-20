import { NextResponse } from "next/server";
import { isApiAuthenticated } from "@/lib/auth/guard";
import { readLocalUpload } from "@/lib/storage";

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** Serves local-disk uploads in dev (Blob URLs are served by Vercel in prod). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!(await isApiAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { path: segments } = await params;
  const pathname = segments.join("/");
  try {
    const buffer = await readLocalUpload(pathname);
    const ext = pathname.split(".").pop()?.toLowerCase() ?? "";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
