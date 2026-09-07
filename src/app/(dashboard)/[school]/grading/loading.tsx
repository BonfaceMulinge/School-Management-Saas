export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-40 rounded bg-muted" />
        <div className="h-4 w-64 rounded bg-muted" />
      </div>
      <div className="h-60 rounded-lg border border-border bg-card" />
    </div>
  );
}