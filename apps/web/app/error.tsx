"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-12 text-center">
      <h1 className="font-display text-4xl font-bold uppercase">Projector trouble</h1>
      <p className="text-dim">Something went wrong loading this page. The service may be waking up.</p>
      <button type="button" onClick={reset} className="h-11 rounded-full bg-[var(--accent)] px-5 font-semibold text-[#1a1306]">
        Try again
      </button>
    </div>
  );
}
