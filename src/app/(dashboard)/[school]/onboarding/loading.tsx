export default function OnboardingLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-64 rounded bg-muted" />
        <div className="h-4 w-80 rounded bg-muted" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="size-9 rounded-full bg-muted" />
            <div className="h-3 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="h-64 rounded-lg border border-border bg-card" />
    </div>
  );
}