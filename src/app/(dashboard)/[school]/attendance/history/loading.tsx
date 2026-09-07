export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-48 rounded bg-muted" />
        <div className="h-4 w-72 rounded bg-muted" />
      </div>
      <div className="h-20 rounded-lg border border-border bg-card" />
      <div className="h-64 rounded-lg border border-border bg-card" />
    </div>
  );
}