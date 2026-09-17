import { useLayoutEffect, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Loader2 } from "lucide-react";
import { AnimationRequestLoader, AnimationScene } from "@/components/workspace/animation-scene";
import { getScenePalette, StickScene } from "@/components/workspace/stick-scene";
import type { ContentMode, WhiteboardScene, WhiteboardState } from "@/components/workspace/types";
import { createSummaryTypingPlan, createSummaryTypingSession } from "@/lib/summary-typing";

type LiveWhiteboardProps = {
  board: WhiteboardState;
  animationRequest: SceneAnimationRequest | null;
  isAnimationLoading?: boolean;
};

export type SceneAnimationBlock = "heading" | "notes";
export type SceneAnimationRequest = (
  | { kind: "reveal"; blocks: SceneAnimationBlock[]; noteBulletIndexes?: number[] }
  | { kind: "expandDiagramNotes"; noteBulletIndexes: number[] }
) & { sceneId: string; revision: number };

/** Keep generated classroom artwork color-accurate wherever its owning pane renders it. */
function GeneratedSceneImage({ scene }: { scene: WhiteboardScene }) {
  if (!scene.generatedAsset) return null;
  const sharesWithNotes = scene.contentModes.includes("diagram") && scene.contentModes.includes("notes");
  return <img src={scene.generatedAsset.dataUrl} alt={scene.generatedAsset.alt} className={`w-full object-contain ${sharesWithNotes ? "max-h-[22rem]" : "max-h-[34rem]"}`} />;
}

/** Show trusted, fixed-size drawing motion while the server creates a diagram. */
function DiagramDrawingLoader({ title }: { title: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="grid min-h-56 w-full place-items-center content-center gap-4 text-center">
      <svg aria-hidden="true" focusable="false" viewBox="0 0 240 144" className="diagram-drawing-loader h-36 w-full max-w-sm fill-none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path pathLength="1" className="diagram-drawing-loader__stroke" d="M40 44h54v38H40z" />
        <path pathLength="1" className="diagram-drawing-loader__stroke diagram-drawing-loader__stroke--second" d="M146 64a25 25 0 1 0 50 0 25 25 0 1 0-50 0" />
        <path pathLength="1" className="diagram-drawing-loader__stroke diagram-drawing-loader__stroke--third" d="M94 63h48m-10-10 10 10-10 10M67 82v24h104V89" />
        <circle className="diagram-drawing-loader__node" cx="67" cy="114" r="6" />
        <circle className="diagram-drawing-loader__node diagram-drawing-loader__node--second" cx="171" cy="114" r="6" />
      </svg>
      <p className="text-sm font-medium text-neutral-600">Drawing the {title} diagram…</p>
    </div>
  );
}

function SceneMode({ mode, scene }: { mode: ContentMode; scene: WhiteboardScene }) {
  const palette = getScenePalette(scene.conceptKey);
  const hasDiagram = scene.contentModes.includes("diagram");
  if (mode === "visual") {
    const visualStatus = scene.visualJobId
      ? `${scene.title} visual is being drawn.`
      : `The ${scene.title} visual could not be generated.`;
    return (
      <section data-content-mode="visual" aria-label="Visualization" className="relative grid min-h-80 min-w-0 place-items-center p-3 sm:min-h-96 sm:p-5">
        {!hasDiagram && scene.generatedAsset ? (
          <GeneratedSceneImage scene={scene} />
        ) : scene.stickScene && (hasDiagram || scene.renderMode === "structured") ? (
          <StickScene scene={scene.stickScene} label={`${scene.title} visual outline`} palette={palette} showConnections={false} />
        ) : (
          <p role="status" className="flex max-w-sm items-center gap-2 text-pretty text-center text-sm font-medium text-neutral-600">
            {scene.visualJobId ? <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" /> : null}
            {visualStatus}
          </p>
        )}
      </section>
    );
  }
  if (mode === "notes") {
    return (
      <section data-content-mode="notes" data-animation-block="notes" aria-label="Notes" className="relative max-h-[34rem] min-h-40 min-w-0 overflow-y-auto p-4 sm:p-6">
        <ul data-semantic-notes aria-label="Summary notes" className="list-disc space-y-3 pl-6 text-[clamp(1rem,1.35vw,1.3rem)] leading-relaxed">
          {scene.summaryBullets.map((bullet, index) => <li key={`${index}-${bullet}`} data-semantic-bullet className="text-pretty">{bullet}</li>)}
        </ul>
        <ul data-typing-layer aria-hidden="true" className="pointer-events-none absolute inset-x-4 top-4 hidden list-disc space-y-3 pl-6 text-[clamp(1rem,1.35vw,1.3rem)] leading-relaxed sm:inset-x-6 sm:top-6">
          {scene.summaryBullets.map((bullet, index) => <li key={`${index}-${bullet}`} data-typing-bullet className="text-pretty empty:invisible" />)}
        </ul>
      </section>
    );
  }
  if (mode === "animation") {
    return (
      <section data-content-mode="animation" aria-label="Animation" className="min-h-80 min-w-0 p-3 sm:min-h-96 sm:p-5">
        {scene.animationSpec
          ? <AnimationScene spec={scene.animationSpec} title={scene.title} />
          : <p role="status" className="grid min-h-56 place-items-center text-center text-sm text-neutral-600">This restored animation is unavailable. Generate it again to replay it.</p>}
      </section>
    );
  }
  return (
    <section data-content-mode="diagram" aria-label="Diagram" className="grid min-h-80 min-w-0 place-items-center p-3 sm:min-h-96 sm:p-5">
      {scene.generatedAsset
        ? <GeneratedSceneImage scene={scene} />
        : scene.visualJobId
          ? <DiagramDrawingLoader title={scene.title} />
          : scene.visualFailed
            ? <p role="status" aria-live="polite" className="max-w-sm text-pretty text-center text-sm font-medium text-neutral-600">The {scene.title} diagram could not be generated.</p>
            : <p role="status" className="max-w-sm text-pretty text-center text-sm text-neutral-600">This restored diagram is unavailable. Generate it again to redraw it.</p>}
    </section>
  );
}

function placementOrder(first: WhiteboardScene, second: WhiteboardScene) {
  return first.placement.row - second.placement.row
    || first.placement.column - second.placement.column
    || first.sceneId.localeCompare(second.sceneId);
}

/** Preserve allocation order while selecting the largest reservation as a three-scene hero. */
function arrangeScenes(scenes: WhiteboardScene[]) {
  const ordered = [...scenes].sort(placementOrder);
  if (ordered.length !== 3) return ordered;
  const hero = [...ordered].sort((first, second) => (
    second.placement.width * second.placement.height
    - first.placement.width * first.placement.height
    || placementOrder(first, second)
  ))[0];
  return [hero, ...ordered.filter((scene) => scene.sceneId !== hero.sceneId)];
}

function pageTemplate(scenes: WhiteboardScene[]) {
  if (scenes.length <= 1) return "grid-cols-1";
  if (scenes.length === 2) {
    const notesOnly = scenes.every((scene) => scene.contentModes.length === 1 && scene.contentModes[0] === "notes");
    return notesOnly ? "grid-cols-2" : "grid-cols-1";
  }
  return "grid-cols-2";
}

/** Carry the singular board topic onto later pages of inherited add-ons. */
function inheritedPrimaryHeading(board: WhiteboardState, pageScenes: WhiteboardScene[]) {
  const primaryScene = board.scenes[0];
  if (
    !primaryScene
    || pageScenes.some((scene) => scene.sceneId === primaryScene.sceneId)
    || !pageScenes.some((scene) => scene.headingMode === "inheritPrimary")
  ) return null;
  return primaryScene;
}

type PreparedSummaryTyping = {
  plan: ReturnType<typeof createSummaryTypingPlan>;
  render: (visibleGraphemes: number) => void;
  finish: () => void;
  cancel: () => void;
};

/** Overlay only changing bullets while the full semantic list keeps its final height and accessibility. */
function prepareSummaryTyping(scene: HTMLElement, bullets: string[], changedIndexes: number[]): PreparedSummaryTyping | null {
  const notes = scene.querySelector<HTMLElement>('[data-content-mode="notes"]');
  const typingLayer = notes?.querySelector<HTMLElement>("[data-typing-layer]");
  const semanticBullets = notes ? [...notes.querySelectorAll<HTMLElement>("[data-semantic-bullet]")] : [];
  const typingBullets = typingLayer ? [...typingLayer.querySelectorAll<HTMLElement>("[data-typing-bullet]")] : [];
  const plan = createSummaryTypingPlan(bullets, changedIndexes);
  if (!notes || !typingLayer || plan.totalGraphemes === 0 || typingBullets.length !== bullets.length || semanticBullets.length !== bullets.length) return null;

  const session = createSummaryTypingSession(plan);
  const targetBullets = plan.frames.map((frame) => ({ semantic: semanticBullets[frame.index] }));
  typingBullets.forEach((bullet, index) => {
    bullet.textContent = "";
    // Empty placeholders need the same height too, otherwise a changed later
    // bullet would be drawn over an unchanged earlier semantic bullet.
    const finalHeight = semanticBullets[index].getBoundingClientRect().height;
    if (finalHeight > 0) bullet.style.minHeight = `${finalHeight}px`;
  });
  targetBullets.forEach(({ semantic }) => {
    // Only the changing semantic text swaps with the decorative prefix layer.
    gsap.set(semantic, { opacity: 0 });
  });
  gsap.set(typingLayer, { display: "block" });

  const restoreSemanticNotes = () => {
    typingBullets.forEach((typing) => {
      typing.textContent = "";
      typing.style.minHeight = "";
    });
    targetBullets.forEach(({ semantic }) => {
      gsap.set(semantic, { clearProps: "opacity" });
    });
    gsap.set(typingLayer, { clearProps: "display" });
  };

  return {
    plan,
    render(visibleGraphemes) {
      session.render(visibleGraphemes).forEach(({ index, text }) => {
        typingBullets[index].textContent = text;
      });
    },
    finish() {
      session.complete();
      restoreSemanticNotes();
    },
    cancel() {
      session.cancel();
      restoreSemanticNotes();
    }
  };
}

/** Append a textContent-only stream so generated summaries never require HTML injection. */
function appendSummaryTyping(timeline: gsap.core.Timeline, typing: PreparedSummaryTyping) {
  const characterState = { count: 0 };
  typing.render(0);
  timeline.to(characterState, {
    count: typing.plan.totalGraphemes,
    duration: typing.plan.durationSeconds,
    ease: "none",
    onUpdate: () => typing.render(characterState.count)
  });
}

/** Render persisted placement semantics through readable 1–4 scene page templates. */
export function LiveWhiteboard({ board, animationRequest, isAnimationLoading = false }: LiveWhiteboardProps) {
  const boardElement = useRef<HTMLDivElement | null>(null);
  const animationLifecycle = useRef(new Map<number, "running" | "complete">());
  const activeAnimation = useRef<{
    revision: number;
    page: number;
    cancel: (allowReplay: boolean) => void;
  } | null>(null);
  const pageCount = Math.max(1, ...board.scenes.map((scene) => scene.placement.page));
  const page = Math.min(board.currentPage, pageCount);
  const pageScenes = board.scenes.filter((scene) => scene.placement.page === page);
  const scenes = arrangeScenes(pageScenes);
  const template = pageTemplate(scenes);
  const pagePrimaryHeading = inheritedPrimaryHeading(board, pageScenes);
  const displayedPage = useRef(page);

  /** Consume each transient request once; restored state and visual polling stay still. */
  useGSAP(() => {
    if (!animationRequest || animationLifecycle.current.has(animationRequest.revision)) return;
    const scene = boardElement.current?.querySelector<HTMLElement>(`[data-scene-id="${animationRequest.sceneId}"]`);
    if (!scene) return;
    const finishWithoutMotion = () => {
      animationLifecycle.current.set(animationRequest.revision, "complete");
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishWithoutMotion();
      return;
    }

    const sceneData = board.scenes.find((candidate) => candidate.sceneId === animationRequest.sceneId);
    const noteBulletIndexes = animationRequest.kind === "expandDiagramNotes"
      ? animationRequest.noteBulletIndexes
      : animationRequest.noteBulletIndexes ?? [];
    const typing = sceneData
      ? prepareSummaryTyping(scene, sceneData.summaryBullets, noteBulletIndexes)
      : null;
    const completeAnimation = () => {
      typing?.finish();
      animationLifecycle.current.set(animationRequest.revision, "complete");
      if (activeAnimation.current?.revision === animationRequest.revision) activeAnimation.current = null;
    };
    let timeline: gsap.core.Timeline | null = null;
    const cleanUpAnimation = (allowReplay = true) => {
      timeline?.kill();
      timeline = null;
      typing?.cancel();
      if (animationLifecycle.current.get(animationRequest.revision) === "running") {
        // StrictMode intentionally runs setup-cleanup-setup. Removing only an
        // in-flight revision lets that second setup start from the restored DOM.
        if (allowReplay) animationLifecycle.current.delete(animationRequest.revision);
        else animationLifecycle.current.set(animationRequest.revision, "complete");
      }
      if (activeAnimation.current?.revision === animationRequest.revision) activeAnimation.current = null;
    };
    const markAnimationRunning = () => {
      animationLifecycle.current.set(animationRequest.revision, "running");
      activeAnimation.current = {
        revision: animationRequest.revision,
        page: sceneData?.placement.page ?? page,
        cancel: cleanUpAnimation
      };
    };
    const startTyping = (nextTimeline?: gsap.core.Timeline) => {
      if (!typing) {
        finishWithoutMotion();
        return null;
      }
      timeline = nextTimeline ?? gsap.timeline({ onComplete: completeAnimation });
      appendSummaryTyping(timeline, typing);
      markAnimationRunning();
      return timeline;
    };

    if (animationRequest.kind === "expandDiagramNotes") {
      const modeGrid = scene.querySelector<HTMLElement>("[data-scene-mode-grid]");
      const diagram = scene.querySelector<HTMLElement>('[data-content-mode="diagram"]');
      const notes = scene.querySelector<HTMLElement>('[data-content-mode="notes"]');
      const modeList = modeGrid ? [...modeGrid.querySelectorAll<HTMLElement>("[data-content-mode]")] : [];
      const gridWidth = modeGrid?.getBoundingClientRect().width ?? 0;
      const finalColumns = modeGrid ? getComputedStyle(modeGrid).gridTemplateColumns : "";
      const columnGap = modeGrid ? parseFloat(getComputedStyle(modeGrid).columnGap) || 0 : 0;
      const notesIndex = notes ? modeList.indexOf(notes) : -1;
      const canAnimateColumns = window.matchMedia("(min-width: 768px)").matches
        && Boolean(modeGrid && diagram && notes)
        && gridWidth > 0
        && modeList.length > 1
        && notesIndex >= 0
        && finalColumns.split(" ").length === modeList.length;

      if (!typing) {
        finishWithoutMotion();
        return;
      }
      if (!canAnimateColumns || !modeGrid || !diagram || !notes) {
        startTyping();
        return cleanUpAnimation;
      }

      const expandedPaneWidth = (gridWidth - columnGap * (modeList.length - 1)) / (modeList.length - 1);
      const initialColumns = modeList.map((_, index) => (
        index === notesIndex ? "0px" : `${expandedPaneWidth}px`
      )).join(" ");
      const artwork = diagram.querySelector<HTMLImageElement>("img");
      const finalArtworkHeight = artwork ? getComputedStyle(artwork).maxHeight : "";
      timeline = gsap.timeline({ onComplete: completeAnimation });
      gsap.set(modeGrid, { gridTemplateColumns: initialColumns });
      timeline.to(modeGrid, {
        gridTemplateColumns: finalColumns,
        duration: 0.26,
        ease: "power2.inOut"
      });
      // Keep the already-loaded artwork node stable while its pane makes room for notes.
      if (artwork) {
        timeline.fromTo(artwork, { maxHeight: "34rem" }, {
          maxHeight: finalArtworkHeight,
          duration: 0.26,
          ease: "power2.inOut"
        }, 0);
      }
      startTyping(timeline);
      timeline.set(modeGrid, { clearProps: "gridTemplateColumns" });
      if (artwork) timeline.set(artwork, { clearProps: "maxHeight" });
      return cleanUpAnimation;
    }

    const blocks = animationRequest.blocks
      .filter((block) => block !== "notes")
      .map((block) => scene.querySelector<HTMLElement>(`[data-animation-block="${block}"]`))
      .filter((block): block is HTMLElement => Boolean(block));
    if (!blocks.length && !typing) {
      finishWithoutMotion();
      return;
    }
    timeline = gsap.timeline({ onComplete: completeAnimation });
    if (blocks.length) {
      timeline.fromTo(
        blocks,
        { autoAlpha: 0, y: 14, filter: "blur(7px)", clipPath: "inset(0 0 100% 0)" },
        {
          autoAlpha: 1,
          y: 0,
          filter: "blur(0px)",
          clipPath: "inset(0 0 0% 0)",
          duration: 0.48,
          stagger: 0.07,
          ease: "power3.out",
          clearProps: "filter,clipPath,transform,opacity,visibility"
        }
      );
    }
    if (typing) startTyping(timeline);
    else markAnimationRunning();
    return cleanUpAnimation;
  }, {
    scope: boardElement,
    dependencies: [animationRequest?.revision],
    revertOnUpdate: true
  });

  /** Stop a detached page's timeline before it can write into stale DOM on navigation. */
  useLayoutEffect(() => {
    if (displayedPage.current === page) return;
    displayedPage.current = page;
    const runningAnimation = activeAnimation.current;
    if (runningAnimation && runningAnimation.page !== page) runningAnimation.cancel(false);
  }, [page]);

  return (
    <section aria-label={`Whiteboard page ${page} of ${pageCount}`} className="h-full min-h-0 bg-[#fffdf7]">
      <div className="h-full min-h-0 overflow-auto">
        <div
          ref={boardElement}
          className={`grid min-h-full min-w-0 content-stretch gap-4 bg-[#fffdf7] px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-[calc(5rem+env(safe-area-inset-top))] text-neutral-950 sm:gap-5 sm:px-6 ${template}`}
          style={{
            backgroundImage: "radial-gradient(circle at 18% 14%, rgba(249, 224, 178, 0.16), transparent 28%), radial-gradient(circle at 82% 76%, rgba(177, 218, 208, 0.13), transparent 30%)"
          }}
        >
          {pagePrimaryHeading ? (
            <header data-board-primary-heading className="col-span-full px-1 pb-1 sm:px-2" aria-label={`Board topic: ${pagePrimaryHeading.title}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">Board topic</p>
              <h2 className="mt-1 text-balance text-[clamp(1.5rem,2.8vw,2.75rem)] font-bold leading-tight tracking-[-0.025em]">
                {pagePrimaryHeading.title}
              </h2>
            </header>
          ) : null}
          {isAnimationLoading ? <div data-animation-request-loader className="col-span-full rounded-xl border border-dashed border-neutral-300 bg-white/70"><AnimationRequestLoader /></div> : null}
          {scenes.map((scene, index) => {
            const palette = getScenePalette(scene.conceptKey);
            const isHero = scenes.length === 1 || (scenes.length === 3 && index === 0);
            const modeColumns = scene.contentModes.length === 4
              ? "md:grid-cols-2"
              : scene.contentModes.length === 3
              ? "md:grid-cols-2 xl:grid-cols-3"
              : scene.contentModes.length === 2 ? "md:grid-cols-2" : "";
            return (
              <article
                key={scene.sceneId}
                data-scene-id={scene.sceneId}
                aria-label={`${scene.title}: ${scene.summary}`}
                className={`relative flex min-h-[26rem] min-w-0 flex-col p-5 sm:p-7 ${isHero ? "col-span-full min-h-[34rem]" : ""}`}
                style={{
                  color: palette.ink,
                  backgroundColor: palette.surface
                }}
              >
                {scene.headingMode === "show" ? (
                  <h2 data-animation-block="heading" className={`text-balance font-bold leading-[1.05] tracking-[-0.03em] ${isHero ? "text-[clamp(2.25rem,5vw,4.75rem)]" : "text-[clamp(1.6rem,3vw,2.75rem)]"}`}>
                    {scene.title}
                  </h2>
                ) : null}
                <div
                  data-scene-mode-grid
                  className={`grid grid-cols-1 flex-1 items-stretch gap-3 ${modeColumns} ${scene.headingMode === "show" ? "mt-5" : ""}`}
                >
                  {scene.contentModes.map((mode) => <SceneMode key={mode} mode={mode} scene={scene} />)}
                </div>
              </article>
            );
          })}
          {scenes.length === 0 ? (
            <div className="col-span-full grid min-h-[34rem] place-items-center text-center text-neutral-500">
              <div><p className="text-xl font-semibold text-neutral-800">The whiteboard is ready.</p><p className="mt-2 text-sm">Teach a concept by voice or type below.</p></div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
