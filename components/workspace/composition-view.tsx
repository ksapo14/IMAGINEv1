"use client";

import { Loader2 } from "lucide-react";
import { DiagramRenderer } from "@/components/building-blocks";
import type {
  BlockSize,
  CompositionBlock,
  CompositionTheme,
  GenerateResponse,
  LayoutMode,
  ThemeDensity,
  ThemePalette
} from "@/components/workspace/types";

export const paletteClasses: Record<ThemePalette, string> = {
  slate: "bg-[var(--canvas-bg)] text-[var(--canvas-text)] transition-colors duration-300",
  sage: "bg-[var(--canvas-bg)] text-[var(--canvas-text)] transition-colors duration-300",
  ember: "bg-[var(--canvas-bg)] text-[var(--canvas-text)] transition-colors duration-300",
  indigo: "bg-[var(--canvas-bg)] text-[var(--canvas-text)] transition-colors duration-300",
  mono: "bg-[var(--canvas-bg)] text-[var(--canvas-text)] transition-colors duration-300"
};

const accentClasses: Record<ThemePalette, string> = {
  slate: "border-[var(--canvas-slate-border)] bg-[var(--canvas-slate-bg)]",
  sage: "border-[var(--canvas-sage-border)] bg-[var(--canvas-sage-bg)]",
  ember: "border-[var(--canvas-ember-border)] bg-[var(--canvas-ember-bg)]",
  indigo: "border-[var(--canvas-indigo-border)] bg-[var(--canvas-indigo-bg)]",
  mono: "border-[var(--canvas-mono-border)] bg-[var(--canvas-mono-bg)]"
};

const blockSizeClasses: Record<BlockSize, string> = {
  compact: "lg:col-span-4",
  medium: "lg:col-span-6",
  large: "lg:col-span-8",
  wide: "lg:col-span-12"
};

function getBlockSpanClass(block: CompositionBlock) {
  if (block.kind === "diagram" || block.visual?.kind === "diagram") {
    return "lg:col-span-12";
  }
  return blockSizeClasses[block.size];
}

function getCanvasClass(layoutMode: LayoutMode, density: ThemeDensity) {
  const densityClass =
    density === "compact"
      ? "gap-4"
      : density === "spacious"
        ? "gap-8"
        : "gap-6";
  const base = `mx-auto grid w-full max-w-[1600px] grid-flow-dense grid-cols-1 ${densityClass} lg:grid-cols-12`;

  if (layoutMode === "visualDominant") {
    return `${base} lg:auto-rows-min`;
  }
  if (layoutMode === "sequence") {
    return `${base} lg:max-w-6xl`;
  }
  return base;
}

function VisualPanel({
  block,
  theme,
  presentation
}: {
  block: CompositionBlock;
  theme: CompositionTheme;
  presentation: boolean;
}) {
  const heightClass = presentation
    ? "h-[min(72dvh,820px)] min-h-[360px] sm:min-h-[520px]"
    : block.kind === "diagram" || block.visual?.kind === "diagram"
      ? "h-[min(72dvh,760px)] min-h-[360px] sm:min-h-[520px]"
      : block.size === "wide"
        ? "h-[min(64dvh,680px)] min-h-[340px] sm:min-h-[420px]"
        : block.size === "large"
          ? "h-[min(60dvh,620px)] min-h-[320px] sm:min-h-[380px]"
          : "h-[min(50dvh,500px)] min-h-[280px] sm:min-h-[300px]";

  if (block.visualFailed) {
    return (
      <div
        role="status"
        className={`${heightClass} grid place-items-center bg-[var(--canvas-surface)] px-6 text-center`}
      >
        <div className="max-w-sm">
          <p className="text-sm font-semibold text-[var(--canvas-text)]">
            Visual unavailable
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--canvas-muted)]">
            Rebuild this lesson to retry the diagram.
          </p>
        </div>
      </div>
    );
  }

  if (block.visual?.kind === "diagram") {
    return (
      <div className={`${heightClass} overflow-hidden bg-[#f4f2ec]`}>
        <DiagramRenderer
          diagram={block.visual.diagram}
          alt={block.visual.alt}
          motion={theme.motion}
        />
      </div>
    );
  }

  if (block.visual?.kind === "generated") {
    return (
      <div className={`grid ${heightClass} place-items-center overflow-hidden bg-[var(--canvas-surface)]`}>
        <img
          src={block.visual.dataUrl}
          alt={block.visual.alt}
          className="max-h-full w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label={block.visualAlt || `Building ${block.title || "diagram"}`}
      className={`${heightClass} grid place-items-center overflow-hidden bg-[var(--canvas-soft)]`}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-[var(--canvas-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Building prepared visual
      </span>
    </div>
  );
}

export function CompositionCard({
  block,
  theme,
  presentation = false,
  showRecallPhrases = false,
  className = ""
}: {
  block: CompositionBlock;
  theme: CompositionTheme;
  presentation?: boolean;
  showRecallPhrases?: boolean;
  className?: string;
}) {
  const hasVisual =
    block.kind === "diagram" ||
    block.kind === "image" ||
    Boolean(block.visual) ||
    Boolean(block.visualJobId);
  const clippingClass =
    block.kind === "diagram" || block.visual?.kind === "diagram"
      ? "overflow-visible"
      : "overflow-hidden";

  return (
    <article
      className={`${presentation ? "lg:col-span-12" : getBlockSpanClass(block)} ${clippingClass} rounded-xl border ${accentClasses[theme.palette]} text-[var(--canvas-text)] ${className}`}
    >
      {hasVisual ? (
        <VisualPanel block={block} theme={theme} presentation={presentation} />
      ) : null}

      <div className={hasVisual ? "space-y-4 px-5 py-4 sm:px-6" : "space-y-5 px-6 py-6 sm:px-7 sm:py-7"}>
        {block.title ? (
          <h2 className="text-balance font-[var(--display)] text-xl font-medium leading-tight tracking-[-0.02em] sm:text-2xl">
            {block.title}
          </h2>
        ) : null}
        {block.body ? (
          <p className="max-w-[65ch] text-pretty text-base leading-7 text-[var(--canvas-muted)]">
            {block.body}
          </p>
        ) : null}

        {block.items.length > 0 && block.kind === "timeline" ? (
          <ol className="space-y-3 text-sm leading-6 text-[var(--canvas-muted)]">
            {block.items.map((item, index) => (
              <li key={`${block.blockId}-${index}-${item}`} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--canvas-soft)] text-xs font-semibold tabular-nums text-[var(--canvas-text)]">
                  {index + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        ) : block.items.length > 0 && block.kind === "comparison" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {block.items.map((item, index) => (
              <div
                key={`${block.blockId}-${index}-${item}`}
                className="rounded-lg border border-[var(--line)] bg-[var(--canvas-soft)] px-4 py-3 text-sm leading-6"
              >
                {item}
              </div>
            ))}
          </div>
        ) : block.items.length > 0 ? (
          <ul className="space-y-3 text-base leading-7 text-[var(--canvas-muted)]">
            {block.items.map((item, index) => (
              <li key={`${block.blockId}-${index}-${item}`} className="flex gap-3">
                <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--canvas-muted)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {showRecallPhrases && block.recallPhrases.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
            {block.recallPhrases.map((phrase) => (
              <span
                key={phrase}
                className="rounded-md border border-[var(--line-strong)] px-3 py-1 font-[var(--mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--canvas-muted)]"
              >
                imagine show me {phrase}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function CompositionView({
  result,
  eyebrow,
  showRecallPhrases = false
}: {
  result: GenerateResponse;
  eyebrow?: string;
  showRecallPhrases?: boolean;
}) {
  return (
    <section aria-live="polite" className="w-full">
      <div className="mx-auto mb-7 max-w-7xl">
        <p className="mb-3 font-[var(--mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--canvas-muted)]">
          {eyebrow ?? result.layoutMode.replace(/([A-Z])/g, " $1").toLowerCase()}
        </p>
        <h1 className="max-w-5xl text-balance font-[var(--display)] text-[clamp(2.4rem,5vw,4.75rem)] font-medium leading-[0.98] tracking-[-0.035em] text-[var(--canvas-text)]">
          {result.title}
        </h1>
      </div>
      <div className={getCanvasClass(result.layoutMode, result.theme.density)}>
        {result.blocks.map((block) => (
          <CompositionCard
            key={block.blockId}
            block={block}
            theme={result.theme}
            showRecallPhrases={showRecallPhrases}
            className="media-preview"
          />
        ))}
      </div>
    </section>
  );
}
