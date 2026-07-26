export default function Loading() {
  return (
    <div className="fixed inset-0 z-[90] grid content-center place-items-center gap-6 overflow-hidden bg-[var(--page)] font-[850] tracking-normal text-[var(--text)]" role="status" aria-label="Loading page">
      <span>IMAGINE V1</span>
      <div className="h-[3px] w-[min(240px,56vw)] animate-route-progress bg-[var(--signal)]" aria-hidden="true" />
    </div>
  );
}
