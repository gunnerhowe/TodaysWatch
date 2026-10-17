import { NextResponse, type NextRequest } from "next/server";
import { GROUP_MAX, type Pair } from "@tp/shared";
import { api } from "@/lib/server";

/**
 * "Start a Couch Truce" posts here: a plain form, so the homepage hero needs no JavaScript.
 * Groups are made at the largest size, so nobody has to say up front how many are coming;
 * picks can run as soon as two people are in.
 */
export async function POST(req: NextRequest) {
  try {
    const { pair } = await api<{ pair: Pair }>("/v1/pairs", { method: "POST", body: JSON.stringify({ size: GROUP_MAX }) });
    return NextResponse.redirect(new URL(`/pair/${pair.inviteCode}?new=1`, req.url), 303);
  } catch {
    return NextResponse.redirect(new URL("/pair?error=1", req.url), 303);
  }
}
