import { NextResponse } from "next/server";

export function GET(request: Request) {
  const header =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry");
  const country = header?.trim().toUpperCase();
  const known = country && country !== "XX" ? country : null;

  return NextResponse.json({ country: known });
}
