import { NextResponse, type NextRequest } from "next/server";
import { API_BASE } from "@/lib/server";

/**
 * The admin page posts the secret it was given; we pass it on as a header and never store it.
 * POST (not GET) so the secret never lands in a URL or a log line.
 */
export async function POST(req: NextRequest) {
  const { secret, days } = ((await req.json().catch(() => ({}))) ?? {}) as { secret?: string; days?: number };
  if (!secret) return NextResponse.json({ error: "secret required" }, { status: 400 });
  const res = await fetch(`${API_BASE}/v1/admin/loop?days=${Math.min(365, Math.max(7, Number(days) || 90))}`, {
    headers: { "x-admin-secret": secret },
    cache: "no-store",
  }).catch(() => null);
  if (!res) return NextResponse.json({ error: "The API is unreachable." }, { status: 502 });
  return new NextResponse(await res.text(), { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json" } });
}
