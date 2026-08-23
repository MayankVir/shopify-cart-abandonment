import { NextRequest, NextResponse } from "next/server";
import { runAutoCallCron } from "@/app/actions/abandoned-checkouts";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runAutoCallCron();

  return NextResponse.json({
    ok: true,
    ...result,
    ranAt: new Date().toISOString(),
  });
}
