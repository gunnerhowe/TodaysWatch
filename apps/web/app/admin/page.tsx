import { LoopAdmin } from "@/components/LoopAdmin";

export const metadata = { title: "Loop metrics", robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-4xl font-bold uppercase">Loop metrics</h1>
      <p className="text-sm text-dim">First-party events only. The success bar from the plan: 1 in 4 come back the next week, and 1 in 10 invitees start their own group.</p>
      <LoopAdmin />
    </div>
  );
}
