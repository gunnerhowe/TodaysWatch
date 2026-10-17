import type { Profile, TitleChip } from "@tp/shared";
import { PairFlow } from "@/components/PairFlow";
import { BRAND } from "@/lib/brand";
import { apiSafe } from "@/lib/server";

export const metadata = { title: "Pick together", description: `${BRAND.name}: help pick what we watch tonight. Tap through 5 you've seen, get three picks everyone's OK with.` };

export default async function PairPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ new?: string }> }) {
  const { code } = await params;
  const { new: isNew } = await searchParams;
  const [{ titles }, { profile }] = await Promise.all([
    apiSafe<{ titles: TitleChip[] }>("/v1/onboarding/grid", { titles: [] }),
    apiSafe<{ profile: Profile | null }>("/v1/profile", { profile: null }),
  ]);
  // don't ask anyone to rate what they already rated or marked seen
  const done = new Set([...(profile?.liked ?? []), ...(profile?.disliked ?? []), ...(profile?.seen ?? [])].map((t) => t.id));
  const clean = code.replace(/[^a-z0-9]/gi, "").slice(0, 20);
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="font-display text-sm font-bold uppercase tracking-widest text-accent">{BRAND.name}</p>
      <PairFlow code={clean} grid={titles.filter((t) => !done.has(t.id))} isNew={isNew === "1"} />
    </div>
  );
}
