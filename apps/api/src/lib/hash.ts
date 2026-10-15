import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config.ts";

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** sha256(salt + source + handle). Raw handles are never stored. */
export function authorHash(source: string, handle: string): string {
  return sha256(`${env.AUTHOR_HASH_SALT}:${source}:${handle.toLowerCase()}`);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function inviteCode(): string {
  // 10 chars, unambiguous alphabet
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += alphabet[randomInt(0, alphabet.length)];
  return s;
}

export function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
