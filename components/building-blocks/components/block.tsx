import type { BlockData } from "../types";

export function Block({ data }: { data: BlockData }) {
  return (
    <article
      className="diagram-enter min-h-32 w-52 shrink-0 rounded-2xl border border-[var(--line-strong)] bg-[var(--canvas-soft)] p-4 text-[var(--canvas-text)] shadow-[0_16px_36px_var(--shadow)]"
      data-block-id={data.id}
    >
      <h4 className="m-0 text-pretty text-sm font-semibold leading-tight tracking-[-0.015em]">
        {data.heading}
      </h4>
      {data.description ? (
        <p className="mb-0 mt-2 text-pretty text-xs leading-5 text-[var(--canvas-muted)]">
          {data.description}
        </p>
      ) : null}
    </article>
  );
}
