import { NextResponse } from "next/server";
import { guestToken, mintStreamToken } from "@/lib/server";

/** Mints a 5-minute stream token for direct browser-to-API streams (chat, progress, /alexa). */
export async function POST() {
  const token = await guestToken();
  if (!token) return NextResponse.json({ error: "no guest session" }, { status: 401 });
  return NextResponse.json({ token: await mintStreamToken(token), url: process.env.NEXT_PUBLIC_STREAM_URL ?? "http://localhost:8080" });
}
