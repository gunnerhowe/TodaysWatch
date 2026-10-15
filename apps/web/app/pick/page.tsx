import Link from "next/link";
import type { Profile } from "@tp/shared";
import { Chat } from "@/components/Chat";
import { apiSafe } from "@/lib/server";

export const metadata = { title: "Ask for a pick" };

export default async function PickPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { profile } = await apiSafe<{ profile: Profile | null }>("/v1/profile", { profile: null });
  const rated = (profile?.liked.length ?? 0) + (profile?.disliked.length ?? 0);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-4xl font-bold uppercase">Tonight&apos;s Pick</h1>
      {rated < 5 && (
        <p className="surface rounded-xl p-3 text-sm text-dim">
          Picks get better with your ratings. <Link href="/start?next=/pick" className="text-accent underline">Rate 5 titles</Link> first, or just ask.
        </p>
      )}
      <Chat initialQuery={q?.slice(0, 300)} />
    </div>
  );
}
