import { NextResponse, type NextRequest } from "next/server";

const GUEST_COOKIE = "tp_guest";
const DEMO_COOKIE = "tp_demo";
const YEAR = 60 * 60 * 24 * 365;

function randomToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Guest-first: every visitor gets an httpOnly guest cookie on first visit, so a judge never
 * hits a login wall. `?demo=1` turns on demo mode (title cards instead of posters), remembered.
 */
export function middleware(req: NextRequest) {
  const demo = req.nextUrl.searchParams.get("demo");
  const needsGuest = !req.cookies.get(GUEST_COOKIE);
  const reqHeaders = new Headers(req.headers);
  let token: string | null = null;
  if (needsGuest) {
    token = randomToken();
    // make the new cookie visible to this same request's server components
    reqHeaders.set("cookie", `${req.headers.get("cookie") ?? ""}${req.headers.get("cookie") ? "; " : ""}${GUEST_COOKIE}=${token}${demo === "1" ? `; ${DEMO_COOKIE}=1` : ""}`);
  } else if (demo === "1" || demo === "0") {
    const others = (req.headers.get("cookie") ?? "").split(/;\s*/).filter((c) => c && !c.startsWith(`${DEMO_COOKIE}=`));
    reqHeaders.set("cookie", [...others, ...(demo === "1" ? [`${DEMO_COOKIE}=1`] : [])].join("; "));
  }
  const res = NextResponse.next({ request: { headers: reqHeaders } });
  if (token) res.cookies.set(GUEST_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/", maxAge: YEAR });
  if (demo === "1") res.cookies.set(DEMO_COOKIE, "1", { sameSite: "lax", path: "/", maxAge: YEAR });
  if (demo === "0") res.cookies.delete(DEMO_COOKIE);
  return res;
}

// _vercel/ is Vercel's own analytics endpoint: no guest cookie needed there
export const config = { matcher: ["/((?!_next/|_vercel/|favicon|icon|apple-icon|manifest|.*\\.(?:png|svg|jpg|ico|txt)$).*)"] };
