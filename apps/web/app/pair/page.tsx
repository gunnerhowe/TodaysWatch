import { CreatePair } from "@/components/PairFlow";

export const metadata = { title: "Pick for two" };

export default function PairStart() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-4xl font-bold uppercase">Pick for two</h1>
      <p className="text-dim">
        Send a link. They rate 5 titles as a guest. We find the picks where your tastes overlap, choosing the one the less-excited person still likes, not the one only one of you loves.
      </p>
      <CreatePair />
    </div>
  );
}
