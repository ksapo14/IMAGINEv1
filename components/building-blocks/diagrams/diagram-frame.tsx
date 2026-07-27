import type { ReactNode } from "react";
import type { DiagramMotion } from "../types";

export function DiagramFrame({
  title,
  description,
  label,
  motion,
  children
}: {
  title: string;
  description: string;
  label: string;
  motion: DiagramMotion;
  children: ReactNode;
}) {
  return (
    <figure
      className={`m-0 flex min-h-full flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--canvas-surface)] text-[var(--canvas-text)] ${
        motion === "subtle" ? "diagram-motion" : ""
      }`}
    >
      <figcaption className="grid gap-2 border-b border-[var(--line)] px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div>
          <h3 className="m-0 text-balance text-lg font-semibold tracking-[-0.025em]">
            {title}
          </h3>
          {description ? (
            <p className="mb-0 mt-1 max-w-[68ch] text-sm leading-6 text-[var(--canvas-muted)]">
              {description}
            </p>
          ) : null}
        </div>
        <span className="w-fit rounded-lg border border-[var(--line)] px-2 py-1 font-mono text-[0.68rem] text-[var(--canvas-muted)]">
          {label}
        </span>
      </figcaption>
      <div className="min-h-0 flex-1 overflow-auto p-5 sm:p-7">{children}</div>
    </figure>
  );
}
