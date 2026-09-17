"use client";

import { useGSAP } from "@gsap/react";
import { BookOpen, Box, Circle, Cloud, Cog, Droplets, Flame, Globe2, Leaf, Play, Square, Sun, Triangle, UserRound, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import type { AnimationSpec, ResolvedAnimationAsset } from "@/components/workspace/types";
import {
  animationAssetTermsKey,
  createRemoteAnimationAssetResolver,
  isRemoteAnimationAssetResolutionPending,
} from "@/lib/animation-asset-resolver";
import {
  ANIMATION_LABEL_CHARACTER_WIDTH,
  ANIMATION_LABEL_LINE_HEIGHT,
  animationLabelLayout,
  animationObjectPositions,
  animationRelationshipGeometry,
  compileAnimationMotionPlan,
  shouldPlayAnimation,
  shouldResolveRemoteAnimationAssets,
} from "@/lib/animation-spec";
import { isFrontendOnlyDeployment } from "@/lib/deployment-mode";
import { API_BASE_URL } from "@/lib/generation-stream";

const LOCAL_ASSETS: Record<string, LucideIcon> = {
  arrow: Play, book: BookOpen, box: Box, circle: Circle, cloud: Cloud, drop: Droplets,
  flame: Flame, gear: Cog, globe: Globe2, leaf: Leaf, person: UserRound, play: Play,
  square: Square, sun: Sun, triangle: Triangle,
};
const remoteAssetResolver = createRemoteAnimationAssetResolver({
  endpoint: `${API_BASE_URL}/api/animation/assets/resolve`,
});

function Loader({ title }: { title: string }) {
  return <div data-animation-loader role="status" aria-live="polite" className="grid min-h-72 place-items-center p-5 text-center text-neutral-600">
    <div><svg aria-hidden="true" viewBox="0 0 160 96" className="animation-drawing-loader mx-auto h-24 w-52 fill-none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path pathLength="1" d="M20 62h38m12 0h38m12 0h20M52 51l12 11-12 11m50-22 12 11-12 11" /><circle cx="20" cy="62" r="8" /><circle cx="140" cy="62" r="8" /></svg><p className="mt-2 text-sm font-medium">Preparing the {title} animation…</p></div>
  </div>;
}

export function AnimationRequestLoader() {
  return <Loader title="SVG" />;
}

/** Render deterministic SVG positions and GSAP motion from a small trusted recipe. */
export function AnimationScene({ spec, title }: { spec: AnimationSpec; title: string }) {
  const root = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const markerId = `animation-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [assets, setAssets] = useState<Map<string, ResolvedAnimationAsset>>(new Map());
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [settledRemoteTermsKey, setSettledRemoteTermsKey] = useState<string | null>(null);
  const [manualPaused, setManualPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [inViewport, setInViewport] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const frontendOnly = isFrontendOnlyDeployment();
  const positions = useMemo(() => animationObjectPositions(spec.template, spec.objects.length), [spec.template, spec.objects.length]);
  const positionById = useMemo(() => new Map(spec.objects.map((object, index) => [object.id, positions[index]])), [positions, spec.objects]);
  const objectLabelLayouts = useMemo(() => new Map(spec.objects.map((object) => [object.id, animationLabelLayout(object.label)])), [spec.objects]);
  const relationshipLabelLayouts = useMemo(() => new Map(spec.relationships.map((relationship) => [relationship.id, animationLabelLayout(relationship.label)])), [spec.relationships]);
  const motionPlan = useMemo(() => compileAnimationMotionPlan(spec, positions), [positions, spec]);
  const remoteTerms = useMemo(() => [...new Set(spec.objects.map((item) => item.assetKey).filter((key) => !LOCAL_ASSETS[key]))], [spec.objects]);
  const remoteTermsKey = animationAssetTermsKey(remoteTerms);
  const canResolveRemoteAssets = shouldResolveRemoteAnimationAssets(frontendOnly, remoteTerms);
  const sceneLoading = canResolveRemoteAssets && (
    loadingAssets || isRemoteAnimationAssetResolutionPending(canResolveRemoteAssets, remoteTerms, settledRemoteTermsKey)
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInViewport(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => setDocumentVisible(!document.hidden);
    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestTermsKey = remoteTermsKey;
    setAssets(remoteAssetResolver.getAssets());
    if (!canResolveRemoteAssets) {
      setSettledRemoteTermsKey(null);
      return () => controller.abort();
    }
    setLoadingAssets(true);
    void remoteAssetResolver.resolve(remoteTerms, controller.signal).then((resolved) => {
      if (!controller.signal.aborted) setAssets(resolved);
    }).finally(() => {
      if (!controller.signal.aborted) {
        setLoadingAssets(false);
        setSettledRemoteTermsKey(requestTermsKey);
      }
    });
    return () => controller.abort();
  }, [canResolveRemoteAssets, remoteTerms, remoteTermsKey]);

  const shouldPlay = shouldPlayAnimation(inViewport, documentVisible, reducedMotion, manualPaused);

  useGSAP(() => {
    if (
      reducedMotion || sceneLoading || !root.current
      || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      || (typeof document !== "undefined" && document.hidden)
    ) return;
    const scope = root.current;
    const initialPositions = new Map(spec.objects.map((object, index) => [object.id, { ...(positions[index] ?? { x: 50, y: 50 }) }]));
    const currentPositions = new Map(spec.objects.map((object, index) => [object.id, { ...(positions[index] ?? { x: 50, y: 50 }) }]));
    // Movement changes SVG attributes, so connectors and their labels always follow their objects.
    const syncSceneGeometry = () => {
      for (const object of spec.objects) {
        const point = currentPositions.get(object.id);
        const node = scope.querySelector<SVGGElement>(`[data-animation-node="${object.id}"]`);
        if (point && node) node.setAttribute("transform", `translate(${point.x} ${point.y})`);
      }
      for (const relationship of spec.relationships) {
        const from = currentPositions.get(relationship.fromId);
        const to = currentPositions.get(relationship.toId);
        const line = scope.querySelector<SVGLineElement>(`[data-animation-relationship-line="${relationship.id}"]`);
        if (!from || !to || !line) continue;
        const geometry = animationRelationshipGeometry(
          from,
          to,
          relationshipLabelLayouts.get(relationship.id) ?? animationLabelLayout(""),
        );
        line.setAttribute("x1", String(geometry.start.x));
        line.setAttribute("y1", String(geometry.start.y));
        line.setAttribute("x2", String(geometry.end.x));
        line.setAttribute("y2", String(geometry.end.y));
        const label = scope.querySelector<SVGGElement>(`[data-animation-relationship-label="${relationship.id}"]`);
        if (label) label.setAttribute("transform", `translate(${geometry.label.x} ${geometry.label.y})`);
      }
    };
    const recipe = gsap.timeline({ repeat: -1, repeatDelay: 0.7, paused: !shouldPlay });
    recipe.timeScale(speed);
    // Run at the beginning of each loop after GSAP rewinds the scene-local position state.
    recipe.call(syncSceneGeometry, [], 0).eventCallback("onRepeat", syncSceneGeometry);
    motionPlan.forEach(({ step, move, rotation }, index) => {
      const target = step.action === "trace"
        ? scope.querySelector(`[data-animation-relationship="${step.targetId}"]`)
        : step.action === "rotate"
          ? scope.querySelector(`[data-animation-icon="${step.targetId}"]`)
          : scope.querySelector(`[data-animation-object="${step.targetId}"]`);
      if (!target) return;
      // Declarative steps are discrete instructions; never let two position tweens compete.
      const at = index === 0 ? 0 : ">";
      if (step.action === "appear") recipe.fromTo(target, { autoAlpha: 0, scale: 0.78 }, { autoAlpha: 1, scale: 1, duration: 0.42, ease: "back.out(1.7)" }, at);
      if (step.action === "move" && move) {
        const point = currentPositions.get(step.targetId);
        if (!point) return;
        recipe.to(point, {
          x: move.to.x,
          y: move.to.y,
          duration: 0.55,
          ease: "power1.inOut",
          onStart: () => {
            Object.assign(point, move.from);
            syncSceneGeometry();
          },
          onUpdate: syncSceneGeometry,
        }, at);
      }
      if (step.action === "rotate" && rotation) recipe.to(target, { rotation: rotation.to, duration: 0.65, transformOrigin: "50% 50%", ease: "power1.inOut" }, at);
      if (step.action === "highlight") recipe.to(target, { scale: 1.14, duration: 0.32, yoyo: true, repeat: 1, transformOrigin: "50% 50%", ease: "power1.inOut" }, at);
      if (step.action === "trace") recipe.fromTo(target, { strokeDasharray: 180, strokeDashoffset: 180, opacity: 0.4 }, { strokeDashoffset: 0, opacity: 1, duration: 0.6, ease: "power1.out" }, at);
    });
    timeline.current = recipe;
    return () => {
      recipe.kill();
      for (const [id, initial] of initialPositions) {
        const current = currentPositions.get(id);
        if (current) Object.assign(current, initial);
      }
      syncSceneGeometry();
      gsap.set(scope.querySelectorAll("[data-animation-object], [data-animation-icon], [data-animation-relationship]"), {
        clearProps: "transform,opacity,visibility,strokeDasharray,strokeDashoffset",
      });
      if (timeline.current === recipe) timeline.current = null;
    };
  }, { scope: root, dependencies: [spec, positions, motionPlan, relationshipLabelLayouts, reducedMotion, documentVisible, sceneLoading], revertOnUpdate: true });

  useEffect(() => {
    const current = timeline.current;
    if (!current) return;
    current.timeScale(speed);
    if (shouldPlay) current.play(); else current.pause();
  }, [shouldPlay, speed]);

  const replay = useCallback(() => { timeline.current?.restart(); setManualPaused(false); }, []);
  return <div ref={root} className="relative flex min-h-72 flex-col" aria-label={`${title} animation`}>
    {sceneLoading ? <Loader title={title} /> : <><svg viewBox="0 0 100 100" role="img" aria-label={`${title}: animated explanation`} className="min-h-56 w-full flex-1" preserveAspectRatio="xMidYMid meet">
      <defs><marker id={markerId} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto-start-reverse"><path d="M0,0 L5,2.5 L0,5" fill="none" stroke="currentColor" strokeWidth="0.7" /></marker></defs>
      <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        {spec.relationships.map((relationship) => {
          const from = positionById.get(relationship.fromId);
          const to = positionById.get(relationship.toId);
          if (!from || !to) return null;
          const labelLayout = relationshipLabelLayouts.get(relationship.id) ?? animationLabelLayout("");
          const geometry = animationRelationshipGeometry(from, to, labelLayout);
          return <g key={relationship.id} data-animation-relationship={relationship.id}>
            <line data-animation-relationship-line={relationship.id} x1={geometry.start.x} y1={geometry.start.y} x2={geometry.end.x} y2={geometry.end.y} markerEnd={relationship.direction === "forward" || relationship.direction === "both" ? `url(#${markerId})` : undefined} markerStart={relationship.direction === "backward" || relationship.direction === "both" ? `url(#${markerId})` : undefined} />
            {relationship.label ? <g data-animation-relationship-label={relationship.id} transform={`translate(${geometry.label.x} ${geometry.label.y})`}><text aria-label={relationship.label} textAnchor="middle" fill="currentColor" stroke="white" strokeWidth="0.8" paintOrder="stroke" fontSize="3.2" fontWeight="650">{labelLayout.lines.map((line, lineIndex) => <tspan key={`${relationship.id}-${lineIndex}`} x="0" y={lineIndex * ANIMATION_LABEL_LINE_HEIGHT} textLength={Array.from(line).length * ANIMATION_LABEL_CHARACTER_WIDTH} lengthAdjust="spacingAndGlyphs">{line}</tspan>)}</text></g> : null}
          </g>;
        })}
        {spec.objects.map((object, index) => {
          const point = positions[index];
          const LocalIcon = LOCAL_ASSETS[object.assetKey];
          const remote = assets.get(object.assetKey);
          const labelLayout = objectLabelLayouts.get(object.id) ?? animationLabelLayout("");
          return <g key={object.id} data-animation-node={object.id} transform={`translate(${point.x} ${point.y})`}><g data-animation-object={object.id}>
            <g data-animation-icon={object.id}>{LocalIcon ? <LocalIcon x="-8" y="-8" width="16" height="16" strokeWidth="1.8" /> : remote ? <image href={remote.dataUrl} x="-8" y="-8" width="16" height="16" preserveAspectRatio="xMidYMid meet" /> : <><circle r="7.5" /><path d="M-3 0h6M0-3v6" /></>}</g>
            <text aria-label={object.label} textAnchor="middle" fill="currentColor" stroke="white" strokeWidth="0.9" paintOrder="stroke" fontSize="3.4" fontWeight="650">{labelLayout.lines.map((line, lineIndex) => <tspan key={`${object.id}-${lineIndex}`} x="0" y={13 + lineIndex * ANIMATION_LABEL_LINE_HEIGHT} textLength={Array.from(line).length * ANIMATION_LABEL_CHARACTER_WIDTH} lengthAdjust="spacingAndGlyphs">{line}</tspan>)}</text>
          </g></g>;
        })}
      </g>
    </svg>
    <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2" aria-label="Animation playback controls">
      <button type="button" onClick={() => setManualPaused((value) => !value)} disabled={reducedMotion} className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">{manualPaused ? "Play" : "Pause"}</button>
      <button type="button" onClick={replay} disabled={reducedMotion} className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">Replay</button>
      {[0.5, 1, 2].map((value) => <button key={value} type="button" onClick={() => setSpeed(value)} disabled={reducedMotion} aria-pressed={speed === value} className={`rounded-md px-2 py-1 text-xs font-semibold disabled:opacity-50 ${speed === value ? "bg-neutral-900 text-white" : "border border-neutral-300"}`}>{value}×</button>)}
    </div>
    {[...assets.values()].length ? <p className="sr-only">External icon attribution: {[...assets.values()].map((asset) => asset.attribution).join("; ")}</p> : null}</>}
  </div>;
}
