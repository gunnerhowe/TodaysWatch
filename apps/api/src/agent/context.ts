import type { Title } from "@prisma/client";
import { SettingsZ } from "@tp/shared";
import { prisma } from "../db.ts";
import type { TurnState } from "./state.ts";

export interface UserContext {
  liked: Title[];
  disliked: Title[];
  seen: Title[];
  wantToWatch: Title[];
  includeSeen: boolean;
  partnerProfileId: string | null;
}

export async function loadUserContext(profileId: string, pairId?: string | null): Promise<UserContext> {
  const [profile, ratings] = await Promise.all([
    prisma.profile.findUniqueOrThrow({ where: { id: profileId } }),
    prisma.rating.findMany({ where: { profileId }, include: { title: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  const settings = SettingsZ.parse(profile.settings ?? {});
  let partnerProfileId: string | null = null;
  const pair = pairId
    ? await prisma.pair.findUnique({ where: { id: pairId } })
    : await prisma.pair.findFirst({ where: { OR: [{ aId: profileId }, { bId: profileId }], bId: { not: null }, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (pair && (pair.aId === profileId || pair.bId === profileId)) partnerProfileId = pair.aId === profileId ? pair.bId : pair.aId;
  return {
    liked: ratings.filter((r) => r.value === "UP").map((r) => r.title),
    disliked: ratings.filter((r) => r.value === "DOWN").map((r) => r.title),
    seen: ratings.filter((r) => r.seen || r.value !== null).map((r) => r.title),
    wantToWatch: ratings.filter((r) => r.wantToWatch).map((r) => r.title),
    includeSeen: settings.includeSeen,
    partnerProfileId,
  };
}

export function applyContext(state: TurnState, ctx: UserContext) {
  for (const t of ctx.liked) state.likedIds.add(t.id);
  for (const t of ctx.disliked) state.dislikedIds.add(t.id);
  for (const t of ctx.seen) state.seenIds.add(t.id);
}
