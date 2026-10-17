import { StartGroupButton } from "@/components/PairFlow";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Pick together" };

export default async function PairStart({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="font-display text-4xl font-bold uppercase leading-tight">Pick together</h1>
      <p className="text-dim">
        For 2 to 5 people. Send one link: everyone joins with the ratings they already have here, or taps through 5 titles as a guest. We skip anything anyone has seen or
        disliked, and choose the picks the least-excited person still likes, not the one only one of you loves.
      </p>
      <StartGroupButton label={`Start a ${BRAND.name}`} />
      {error && (
        <p role="alert" className="text-sm text-[var(--color-disliked)]">
          Couldn&apos;t make a link just now. Try again in a moment.
        </p>
      )}
    </div>
  );
}
