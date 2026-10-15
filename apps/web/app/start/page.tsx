import type { TitleChip } from "@tp/shared";
import { OnboardingGrid } from "@/components/OnboardingGrid";
import { apiSafe } from "@/lib/server";

export const metadata = { title: "Rate 5 to get picks" };

export default async function Start({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const { titles } = await apiSafe<{ titles: TitleChip[] }>("/v1/onboarding/grid", { titles: [] });
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/pick";
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl font-bold uppercase">Rate 5 to get picks</h1>
      <p className="text-dim">Thumbs up what you liked, thumbs down what you didn&apos;t. Mark &quot;Seen&quot; if you watched it but don&apos;t have a strong opinion.</p>
      <OnboardingGrid titles={titles} next={safeNext} />
    </div>
  );
}
