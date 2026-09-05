import { NextRequest, NextResponse } from "next/server";
import { runAutoCallCron } from "@/app/actions/abandoned-checkouts";

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const requestUrl = request.nextUrl.pathname;
  const userAgent = request.headers.get("user-agent");
  const forwardedFor = request.headers.get("x-forwarded-for");

  console.info(
    "[process-calls] incoming",
    JSON.stringify({
      method: request.method,
      path: requestUrl,
      hasBearer: Boolean(authHeader?.startsWith("Bearer ")),
      userAgent,
      forwardedFor,
    })
  );

  if (!cronSecret) {
    console.warn(
      "[process-calls] rejected",
      JSON.stringify({ reason: "CRON_SECRET is not configured", status: 500 })
    );
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.warn(
      "[process-calls] rejected",
      JSON.stringify({ reason: "Unauthorized", status: 401 })
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAutoCallCron();
    const body = {
      ok: true,
      ...result,
      ranAt: new Date().toISOString(),
    };

    console.info(
      "[process-calls] completed",
      JSON.stringify({
        ...body,
        durationMs: Date.now() - startedAt,
      })
    );

    return NextResponse.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cron error";
    console.error(
      "[process-calls] failed",
      JSON.stringify({
        error: message,
        durationMs: Date.now() - startedAt,
      })
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
