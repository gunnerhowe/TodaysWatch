import { prisma } from "../db.ts";

/**
 * Two-level cache: a small in-process LRU in front of the CacheEntry table, so identical
 * calls (TMDB search, Qloo tools) are made once per TTL even across restarts.
 */
const MEM_MAX = 2000;
const mem = new Map<string, { v: unknown; exp: number }>();

function memGet<T>(key: string): T | undefined {
  const hit = mem.get(key);
  if (!hit) return undefined;
  if (hit.exp < Date.now()) {
    mem.delete(key);
    return undefined;
  }
  mem.delete(key);
  mem.set(key, hit);
  return hit.v as T;
}

function memSet(key: string, v: unknown, ttlMs: number) {
  if (mem.size >= MEM_MAX) mem.delete(mem.keys().next().value!);
  mem.set(key, { v, exp: Date.now() + ttlMs });
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const m = memGet<T>(key);
  if (m !== undefined) return m;
  try {
    const row = await prisma.cacheEntry.findUnique({ where: { key } });
    if (!row || row.expiresAt.getTime() < Date.now()) return undefined;
    memSet(key, row.value, row.expiresAt.getTime() - Date.now());
    return row.value as T;
  } catch {
    return undefined;
  }
}

export async function cacheSet(key: string, value: unknown, ttlMs: number, persist = true): Promise<void> {
  memSet(key, value, ttlMs);
  if (!persist) return;
  const expiresAt = new Date(Date.now() + ttlMs);
  try {
    await prisma.cacheEntry.upsert({
      where: { key },
      create: { key, value: value as object, expiresAt },
      update: { value: value as object, expiresAt },
    });
  } catch {
    /* cache is best-effort */
  }
}

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, opts: { persist?: boolean } = {}): Promise<{ value: T; hit: boolean }> {
  const hit = await cacheGet<T>(key);
  if (hit !== undefined) return { value: hit, hit: true };
  const value = await fn();
  await cacheSet(key, value, ttlMs, opts.persist ?? true);
  return { value, hit: false };
}

export async function purgeExpiredCache(): Promise<number> {
  const r = await prisma.cacheEntry.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return r.count;
}
