import "server-only";
import { cookies } from "next/headers";
import { SignJWT } from "jose";

export const GUEST_COOKIE = "tp_guest";
export const DEMO_COOKIE = "tp_demo";

/** Base URLs without trailing slashes, so a value pasted as "https://host/" still works. */
const trimUrl = (u: string) => u.trim().replace(/\/+$/, "");
export const API_BASE = trimUrl(process.env.API_BASE_URL || "http://localhost:8080");
export const STREAM_URL = trimUrl(process.env.NEXT_PUBLIC_STREAM_URL || process.env.API_BASE_URL || "http://localhost:8080");
const API = API_BASE;

export async function guestToken(): Promise<string | null> {
  return (await cookies()).get(GUEST_COOKIE)?.value ?? null;
}

export async function isDemo(): Promise<boolean> {
  return (await cookies()).get(DEMO_COOKIE)?.value === "1";
}

/**
 * Server-side call to the API with the shared secret and this visitor's guest token.
 * The browser never sees API_SHARED_SECRET or talks to Qloo.
 */
export async function api<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const token = init.token === undefined ? await guestToken() : init.token;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-secret": process.env.API_SHARED_SECRET ?? "",
      ...(token ? { "x-profile-token": token } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ""));
  return (await res.json()) as T;
}

export async function apiSafe<T>(path: string, fallback: T): Promise<T> {
  try {
    return await api<T>(path);
  } catch {
    return fallback;
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    body: string,
  ) {
    super(`API ${status}: ${body.slice(0, 200)}`);
  }
}

/** 5-minute signed token for streams (scoring progress, chat, /alexa), so long streams skip Vercel. */
export async function mintStreamToken(token: string): Promise<string> {
  const key = new TextEncoder().encode(process.env.STREAM_TOKEN_SECRET ?? "dev-stream-secret");
  return new SignJWT({ scope: "stream" }).setProtectedHeader({ alg: "HS256" }).setSubject(token).setIssuedAt().setExpirationTime("300s").sign(key);
}
