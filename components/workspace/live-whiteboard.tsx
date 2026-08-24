import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Loader2 } from "lucide-react";
import { getScenePalette, StickScene } from "@/components/workspace/stick-scene";
import type { ContentMode, WhiteboardScene, WhiteboardState } from "@/components/workspace/types";

type LiveWhiteboardProps = {
  board: WhiteboardState;
  animationRequest: SceneAnimationRequest | null;
};

export type SceneAnimationBlock = "heading" | "notes";
export type SceneAnimationRequest = {
  sceneId: string;
  revision: number;
  blocks: SceneAnimationBlock[];
};

function SceneMode({ mode, scene }: { mode: ContentMode; scene: WhiteboardScene }) {
  const palette = getScenePalette(scene.conceptKey);
  if (mode === "visual") {
    const visualStatus = scene.visualJobId
      ? `${scene.title} visual is being drawn.`
      : `The ${scene.title} visual could not be generated.`;
    return (
      <section aria-label="Visualization" className="relative grid min-h-80 place-items-center p-3 sm:min-h-96 sm:p-5">
        {scene.generatedAsset ? (
          // The backend accepts only bounded image data URLs; model text stays outside markup.
          <img src={scene.generatedAsset.dataUrl} alt={scene.generatedAsset.alt} className="max-h-[34rem] w-full object-contain grayscale contrast-125 mix-blend-multiply" />
        ) : scene.renderMode === "structured" && scene.stickScene ? (
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
      <section data-animation-block="notes" aria-label="Notes" className="max-h-[34rem] min-h-40 overflow-y-auto p-4 sm:p-6">
        <ul aria-label="Summary notes" className="list-disc space-y-3 pl-6 text-[clamp(1rem,1.35vw,1.3rem)] leading-relaxed">
          {scene.summaryBullets.map((bullet, index) => <li key={`${index}-${bullet}`} className="text-pretty">{bullet}</li>)}
        </ul>
      </section>
    );
  }
  return (
    <section aria-label="Diagram" className="grid min-h-80 place-items-center p-3 sm:min-h-96 sm:p-5">
      {scene.stickScene
        ? <StickScene scene={scene.stickScene} label={`${scene.title} diagram`} palette={palette} />
        : <p role="status" className="text-sm">The {scene.title} diagram is unavailable.</p>}
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

/** Render persisted placement semantics through readable 1–4 scene page templates. */
export function LiveWhiteboard({ board, animationRequest }: LiveWhiteboardProps) {
  const boardElement = useRef<HTMLDivElement | null>(null);
  const pageCount = Math.max(1, ...board.scenes.map((scene) => scene.placement.page));
  const page = Math.min(board.currentPage, pageCount);
  const pageScenes = board.scenes.filter((scene) => scene.placement.page === page);
  const scenes = arrangeScenes(pageScenes);
  const template = pageTemplate(scenes);
  const pagePrimaryHeading = inheritedPrimaryHeading(board, pageScenes);

  /** Reveal complete changed blocks with one restrained wipe; restored content stays still. */
  useGSAP(() => {
    if (!animationRequest || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const scene = boardElement.current?.querySelector<HTMLElement>(`[data-scene-id="${animationRequest.sceneId}"]`);
    if (!scene) return;
    const blocks = animationRequest.blocks
      .map((block) => scene.querySelector<HTMLElement>(`[data-animation-block="${block}"]`))
      .filter((block): block is HTMLElement => Boolean(block));
    if (!blocks.length) return;
    gsap.fromTo(
      blocks,
      { autoAlpha: 0, y: 14, filter: "blur(7px)", clipPath: "inset(0 0 100% 0)" },
      { autoAlpha: 1, y: 0, filter: "blur(0px)", clipPath: "inset(0 0 0% 0)", duration: 0.48, stagger: 0.07, ease: "power3.out", clearProps: "filter,clipPath,transform,opacity,visibility" }
    );
  }, { scope: boardElement, dependencies: [animationRequest?.revision], revertOnUpdate: true });

  return (
    <section aria-label={`Whiteboard page ${page} of ${pageCount}`} className="h-full min-h-0 bg-[#fffdf7]">
      <div className="h-full min-h-0 overflow-auto">
        <div
          ref={boardElement}
          className={`grid min-h-full min-w-[760px] content-stretch gap-4 bg-[#fffdf7] px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-[calc(5rem+env(safe-area-inset-top))] text-neutral-950 sm:gap-5 sm:px-6 ${template}`}
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
          {scenes.map((scene, index) => {
            const palette = getScenePalette(scene.conceptKey);
            const isHero = scenes.length === 1 || (scenes.length === 3 && index === 0);
            const modeFloor = scene.contentModes.length * 18;
            return (
              <article
                key={scene.sceneId}
                data-scene-id={scene.sceneId}
                aria-label={`${scene.title}: ${scene.summary}`}
                className={`relative flex min-h-[26rem] flex-col p-5 sm:p-7 ${isHero ? "col-span-full min-h-[34rem]" : ""}`}
                style={{
                  color: palette.ink,
                  backgroundColor: palette.surface,
                  minWidth: `${Math.max(22, modeFloor)}rem`
                }}
              >
                {scene.headingMode === "show" ? (
                  <h2 data-animation-block="heading" className={`text-balance font-bold leading-[1.05] tracking-[-0.03em] ${isHero ? "text-[clamp(2.25rem,5vw,4.75rem)]" : "text-[clamp(1.6rem,3vw,2.75rem)]"}`}>
                    {scene.title}
                  </h2>
                ) : null}
                <div
                  className={`grid flex-1 items-stretch gap-3 ${scene.headingMode === "show" ? "mt-5" : ""}`}
                  style={{ gridTemplateColumns: `repeat(${scene.contentModes.length}, minmax(18rem, 1fr))` }}
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
