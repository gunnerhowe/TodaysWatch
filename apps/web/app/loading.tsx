export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="skeleton h-10 w-2/3" />
      <div className="skeleton h-40" />
      <p className="text-sm text-faint">Loading…</p>
    </div>
  );
}
