import { NextResponse, type NextRequest } from "next/server";
import { runFullSync } from "@/lib/graph-sync";

export const maxDuration = 300;

// Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`. Cron endpoints
// have no built-in auth — this check is mandatory.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runFullSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
