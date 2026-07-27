import type { RoundData } from "../types";

export function Round({ data }: { data: RoundData }) {
  return (
    <article
      className="diagram-enter grid aspect-square w-44 shrink-0 place-items-center rounded-full border border-[var(--line-strong)] bg-[var(--canvas-soft)] p-5 text-center text-[var(--canvas-text)] shadow-[0_16px_36px_var(--shadow)]"
      data-round-id={data.id}
    >
      <div>
        <h4 className="m-0 text-balance text-sm font-semibold leading-tight tracking-[-0.015em]">
          {data.heading}
        </h4>
        {data.description ? (
          <p className="mb-0 mt-2 text-pretty text-[0.7rem] leading-[1.45] text-[var(--canvas-muted)]">
            {data.description}
          </p>
        ) : null}
      </div>
    </article>
  );
}
