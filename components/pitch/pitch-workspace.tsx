"use client";

import { FormEvent, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PitchDeckSlide, DECK_RENDERER_IDS } from "./deck/pitch-deck-slide";
import { PitchTranscriptionTransport, type PitchSpeechStatus } from "./transcription-transport";
import { isFrontendOnlyDeployment, FRONTEND_ONLY_NOTICE } from "../../lib/deployment-mode";
import { createPitchController, type PitchController } from "../../lib/pitch/controller";
import { validatePitchRendererIds } from "../../lib/pitch/deck";
import type { PitchModelAdapter } from "../../lib/pitch/types";
import { loadPitchPresentation, savePitchPresentation } from "../../lib/pitch/storage";
import styles from "./pitch-workspace.module.css";

function isEditableTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("a, input, textarea, select, button, summary, [contenteditable]:not([contenteditable='false']), [role='button'], [role='tab'], [role='textbox'], [role='combobox']"));
}

/** Presentation shell: controls own transitions while the deck only renders a semantic ID. */
export function PitchWorkspace({ adapter }: { adapter?: PitchModelAdapter }) {
  const controllerRef = useRef<PitchController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createPitchController({ adapter });
    if (!validatePitchRendererIds(DECK_RENDERER_IDS, controllerRef.current.getSnapshot().slides)) throw new Error("Pitch metadata and slide renderers do not match.");
  }
  const controller = controllerRef.current;
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const transportRef = useRef<PitchTranscriptionTransport | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const storageRef = useRef<Storage | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [scale, setScale] = useState(1);
  const [replayKey, setReplayKey] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [typedUtterance, setTypedUtterance] = useState("");
  const [notice, setNotice] = useState("");
  const frontendOnly = isFrontendOnlyDeployment();
  const currentIndex = state.slides.findIndex((slide) => slide.id === state.currentSlideId);
  const currentSlide = state.slides[currentIndex] ?? state.slides[0];

  useEffect(() => {
    try { storageRef.current = window.localStorage; }
    catch { setNotice("Presentation state cannot be saved in this browser."); }
    const restored = loadPitchPresentation(storageRef.current);
    if (restored && restored !== controller.getSnapshot().currentSlideId) controller.goToSlide(restored);
    setHydrated(true);
  }, [controller]);
  useEffect(() => {
    if (!hydrated) return;
    const saved = savePitchPresentation(storageRef.current, state.currentSlideId);
    if (!saved.ok) setNotice(saved.message);
  }, [hydrated, state.currentSlideId]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateScale = () => setScale(Math.max(0, Math.min(stage.clientWidth / 1440, stage.clientHeight / 810)));
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const transport = new PitchTranscriptionTransport({
      onStatus: (status: PitchSpeechStatus) => controller.setTranscriptionStatus(status),
      onTranscript: (transcript) => controller.setTranscript(transcript),
      onUtterance: (utterance) => { void controller.evaluateUtterance(utterance, "deepgram"); },
      onError: setNotice
    });
    transportRef.current = transport;
    if (frontendOnly) controller.setTranscriptionStatus("unavailable");
    // StrictMode reuses this store on effect replay; cancel work without disposing it.
    return () => { transport.stop(false); controller.cancelPendingEvaluation(); transportRef.current = null; };
  }, [controller, frontendOnly]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isEditableTarget(event.target)) return;
      switch (event.key) {
        case "ArrowLeft": case "PageUp": case "Backspace": controller.goToAdjacent(-1); break;
        case "ArrowRight": case "PageDown": case " ": case "Enter": controller.goToAdjacent(1); break;
        case "Home": controller.goToSlide(state.slides[0].id); break;
        case "End": controller.goToSlide(state.slides[state.slides.length - 1].id); break;
        case "r": case "R": controller.cancelPendingEvaluation(); setReplayKey(value => value + 1); break;
        case "f": case "F":
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => setNotice("Fullscreen is unavailable."));
          else if (workspaceRef.current?.requestFullscreen) void workspaceRef.current.requestFullscreen().catch(() => setNotice("Fullscreen is unavailable."));
          break;
        default: return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller, state.slides]);

  const toggleMicrophone = useCallback(() => {
    if (frontendOnly) { setNotice(FRONTEND_ONLY_NOTICE); return; }
    if (state.transcriptionStatus === "connecting" || state.transcriptionStatus === "listening") transportRef.current?.stop();
    else void transportRef.current?.start();
  }, [frontendOnly, state.transcriptionStatus]);
  const toggleFullscreen = useCallback(async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (workspaceRef.current?.requestFullscreen) await workspaceRef.current.requestFullscreen(); else setNotice("Fullscreen is unavailable in this browser."); }
    catch { setNotice("Fullscreen is unavailable in this browser."); }
  }, []);
  const submitSimulation = useCallback((event: FormEvent) => {
    event.preventDefault();
    if (frontendOnly) { setNotice(FRONTEND_ONLY_NOTICE); return; }
    const utterance = typedUtterance.trim();
    if (!utterance) return;
    setTypedUtterance("");
    void controller.evaluateUtterance(utterance, "simulation");
  }, [controller, frontendOnly, typedUtterance]);
  const navigate = useCallback((slideId: string | undefined) => {
    if (slideId) controller.goToSlide(slideId);
  }, [controller]);

  return <main className={styles.workspace} ref={workspaceRef} aria-label="Imagineer Pitch Mode">
    <header className={styles.header}><div><p className={styles.eyebrow}>Imagineer</p><h1>Pitch Mode</h1></div><div className={styles.status} aria-live="polite">{state.evaluationStatus === "evaluating" ? "Evaluating slide context…" : state.lastOutcome.message || "Ready"}</div></header>
    <div className={styles.stage} ref={stageRef}><div className={styles.scaledDeck} style={{ width: `${1440 * scale}px`, height: `${810 * scale}px` }}><div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: 1440, height: 810 }}><PitchDeckSlide slideId={currentSlide.id} replayKey={replayKey} /></div></div></div>
    <section className={styles.controls} aria-label="Presentation controls">
      <button type="button" onClick={() => navigate(state.slides[currentIndex - 1]?.id)} disabled={currentIndex <= 0}>Previous</button>
      <label className={styles.slidePicker}>Slide <select value={state.currentSlideId} onChange={(event) => navigate(event.target.value)}>{state.slides.map((slide) => <option value={slide.id} key={slide.id}>{slide.title}</option>)}</select></label>
      <span className={styles.progress}>{currentIndex + 1} / {state.slides.length}</span>
      <button type="button" onClick={() => navigate(state.slides[currentIndex + 1]?.id)} disabled={currentIndex >= state.slides.length - 1}>Next</button>
      <button type="button" onClick={() => { controller.cancelPendingEvaluation(); setReplayKey((value) => value + 1); }}>Replay</button><button type="button" onClick={() => void toggleFullscreen()}>Fullscreen</button>
      <button type="button" onClick={toggleMicrophone} disabled={frontendOnly} aria-describedby={frontendOnly ? "pitch-deployment-notice" : undefined} aria-pressed={state.transcriptionStatus === "listening"}>{state.transcriptionStatus === "listening" || state.transcriptionStatus === "connecting" ? "Stop mic" : "Start mic"}</button>
      <span className={styles.progress}>Microphone: {state.transcriptionStatus}</span>
      <button type="button" onClick={() => controller.setAutomaticNavigation(!state.automaticNavigation)} aria-pressed={state.automaticNavigation}>Auto: {state.automaticNavigation ? "on" : "paused"}</button>
      <button type="button" onClick={() => setPanelOpen((open) => !open)} aria-expanded={panelOpen} aria-controls="pitch-transcript">Transcript & test</button>
    </section>
    {panelOpen && <aside id="pitch-transcript" className={styles.panel} aria-label="Transcript and slide evaluation"><p><strong>Latest transcript:</strong> {state.latestTranscript || "No speech received yet."}</p><p><strong>Outcome:</strong> {state.lastOutcome.message || "No model evaluation yet."}</p>{frontendOnly ? <p>Slide evaluation requires a backend connection.</p> : <form onSubmit={submitSimulation}><label htmlFor="pitch-utterance">Test utterance</label><textarea id="pitch-utterance" maxLength={4000} value={typedUtterance} onChange={(event) => setTypedUtterance(event.target.value)} placeholder="Try: Here is our three-year financial projection." /><button type="submit" disabled={!typedUtterance.trim()}>Evaluate</button></form>}</aside>}
    {frontendOnly && <p id="pitch-deployment-notice" className={styles.notice}>{FRONTEND_ONLY_NOTICE}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
  </main>;
}
