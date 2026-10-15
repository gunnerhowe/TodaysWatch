import { NextResponse, type NextRequest } from "next/server";
import { API_BASE, guestToken } from "@/lib/server";

/**
 * Normal calls go browser -> this route handler -> API, adding the shared secret and the
 * visitor's guest token. Only /v1 paths are forwarded.
 */
const API = API_BASE;

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path.some((p) => p === ".." || p.includes("/"))) return NextResponse.json({ error: "bad path" }, { status: 400 });
  const token = await guestToken();
  const url = `${API}/v1/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();
  const res = await fetch(url, {
    method: req.method,
    headers: {
      // only declare JSON when there is a body; the API rejects an empty JSON body (e.g. DELETE)
      ...(body ? { "content-type": "application/json" } : {}),
      "x-api-secret": process.env.API_SHARED_SECRET ?? "",
      ...(token ? { "x-profile-token": token } : {}),
    },
    body: body || undefined,
    cache: "no-store",
  }).catch(() => null);
  if (!res) return NextResponse.json({ error: "The service is unreachable right now." }, { status: 502 });
  const text = await res.text();
  const headers: Record<string, string> = { "content-type": res.headers.get("content-type") ?? "application/json" };
  if (path[0] === "profile" && path[1] === "export") headers["content-disposition"] = 'attachment; filename="tonights-pick-export.json"';
  return new NextResponse(text, { status: res.status, headers });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
