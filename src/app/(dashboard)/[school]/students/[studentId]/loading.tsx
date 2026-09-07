export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-56 rounded bg-muted" />
        <div className="h-4 w-80 rounded bg-muted" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-72 rounded-lg border border-border bg-card" />
        <div className="h-72 rounded-lg border border-border bg-card" />
        <div className="h-72 rounded-lg border border-border bg-card" />
      </div>
      <div className="h-52 rounded-lg border border-border bg-card" />
    </div>
  );
}