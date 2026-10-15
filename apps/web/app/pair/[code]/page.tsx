import type { TitleChip } from "@tp/shared";
import { PairFlow } from "@/components/PairFlow";
import { apiSafe } from "@/lib/server";

export const metadata = { title: "Pick for two" };

export default async function PairPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ done?: string }> }) {
  const { code } = await params;
  const { done } = await searchParams;
  const { titles } = await apiSafe<{ titles: TitleChip[] }>("/v1/onboarding/grid", { titles: [] });
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-4xl font-bold uppercase">Pick for two</h1>
      {/* remount after rating so the flow re-reads the pair state */}
      <PairFlow key={done ? "done" : "rate"} code={code.replace(/[^a-z0-9]/gi, "").slice(0, 20)} grid={titles} />
    </div>
  );
}
