export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-4 w-24 rounded bg-muted" />
      <div className="h-6 w-64 rounded bg-muted" />
      <div className="h-96 rounded-lg border border-border bg-card" />
    </div>
  );
}