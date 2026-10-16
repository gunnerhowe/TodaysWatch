import { CreatePair } from "@/components/PairFlow";

export const metadata = { title: "Pick together" };

export default function PairStart() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-4xl font-bold uppercase">Pick together</h1>
      <p className="text-dim">
        For 2 to 5 people. Send a link: everyone joins with the ratings they already have here, or rates 5 titles as a guest. We skip anything anyone has seen or disliked, and choose the picks the least-excited person still likes, not the one only one of you loves.
      </p>
      <CreatePair />
    </div>
  );
}
