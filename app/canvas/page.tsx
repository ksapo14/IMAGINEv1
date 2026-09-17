"use client";

import Image from "next/image";
import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowLeft, ArrowUp, BookOpen, ChevronLeft, ChevronRight, Library, Loader2, Mic, MicOff, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LiveWhiteboard, type SceneAnimationBlock, type SceneAnimationRequest } from "@/components/workspace/live-whiteboard";
import type {
  DeepgramMessage,
  DeepgramStatusResponse,
  GenerateRequest,
  LessonContextRecord,
  RecentTurn,
  SpeechStatus,
  VisualJobResponse,
  WhiteboardState
} from "@/components/workspace/types";
import { FRONTEND_ONLY_NOTICE, isFrontendOnlyDeployment } from "@/lib/deployment-mode";
import { API_BASE_URL, streamGeneration } from "@/lib/generation-stream";
import { requestsAnimation } from "@/lib/animation-spec";
import { loadLessonLibrary, removeLesson, saveLessonLibrary, upsertLesson } from "@/lib/lesson-library";
import { getChangedSummaryBulletIndexes } from "@/lib/summary-typing";
import {
  consumeWakeCommand,
  dequeueLiveTurn,
  enqueueLiveTurn,
  IDLE_WAKE_COMMAND_STATE,
  isDuplicateFinalizedSpeech,
  type FinalizedSpeechTurn,
  type QueuedLiveTurn,
  type WakeCommandState
} from "@/lib/live-session";

import { appendRecentTurn, applyBoardDecision, cancelRemovedVisualJobs, cancelSupersededVisualJob, EMPTY_WHITEBOARD, getBoardDigest, getConceptMemory, patchGeneratedAsset, sceneOwnsVisualJob, settlePendingVisualJobs, shouldAnimateDiagramNotesExpansion } from "@/lib/whiteboard-session";
import {
  createEmptyWhiteboardSession,
  loadWhiteboardSessionStore,
  saveWhiteboardSessionStore,
  type DashboardTab,
  type WhiteboardSession
} from "@/lib/whiteboard-session-storage";

/** Local menu glyph avoids depending on a cloud-only Lucide source-map file. */
function MoreMenuIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  );
}

const tabs = [
  { id: "prepare" as const, label: "Lesson context", icon: Sparkles },
  { id: "library" as const, label: "Library", icon: Library },
  { id: "live" as const, label: "Live whiteboard", icon: BookOpen }
];

function getTranscriptionWsUrl() {
  const url = new URL(API_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/transcribe";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function getTranscriptionStatusUrl() {
  const url = new URL(API_BASE_URL);
  url.pathname = "/api/transcribe/status";
  url.searchParams.set("checkKey", "true");
  return url.toString();
}

function getPreferredAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function getDeepgramFailureMessage(message: DeepgramMessage) {
  return message.message ?? message.description ?? message.code ?? "Speech transcription failed.";
}

async function fetchDeepgramStatus() {
  if (isFrontendOnlyDeployment()) throw new Error(FRONTEND_ONLY_NOTICE);
  const response = await fetch(getTranscriptionStatusUrl(), { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("The local backend could not check transcription status.");
  return (await response.json()) as DeepgramStatusResponse;
}

async function fetchVisualJob(jobId: string, signal: AbortSignal) {
  if (isFrontendOnlyDeployment()) throw new Error(FRONTEND_ONLY_NOTICE);
  const response = await fetch(`${API_BASE_URL}/api/visual/${jobId}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error("The image request could not be completed.");
  return (await response.json()) as VisualJobResponse;
}

function createLessonId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function StatusBanner({ error, warning, notice }: { error: string; warning: string; notice: string }) {
  const message = error || warning || notice;
  if (!message) return null;
  const tone = error
    ? "bg-red-50/90 text-red-800"
    : warning
      ? "bg-amber-50/90 text-amber-900"
      : "bg-white/85 text-neutral-900";
  return <div role={error ? "alert" : "status"} className={`fixed left-1/2 top-[76px] z-50 w-[min(calc(100%-32px),620px)] -translate-x-1/2 rounded-2xl px-5 py-3 text-center text-sm shadow-[0_10px_35px_rgba(80,70,50,0.12)] backdrop-blur-xl ${tone}`}>{message}</div>;
}

export default function CanvasPage() {
  const frontendOnly = isFrontendOnlyDeployment();
  const [activeTab, setActiveTab] = useState<DashboardTab>("prepare");
  const [lessons, setLessons] = useState<LessonContextRecord[]>([]);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonSubject, setLessonSubject] = useState("");
  const [lessonSource, setLessonSource] = useState("");
  const [board, setBoard] = useState<WhiteboardState>(EMPTY_WHITEBOARD);
  const [recentTurns, setRecentTurns] = useState<RecentTurn[]>([]);
  const [turnSequenceValue, setTurnSequenceValue] = useState(0);
  const [sessionRevision, setSessionRevision] = useState(0);
  const [capturedInput, setCapturedInput] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeRevision, setNoticeRevision] = useState(0);
  const [sceneAnimation, setSceneAnimation] = useState<SceneAnimationRequest | null>(null);
  const [libraryStorageNotice, setLibraryStorageNotice] = useState("");
  const [sessionStorageNotice, setSessionStorageNotice] = useState("");
  const [speechNotice, setSpeechNotice] = useState("");
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>("idle");
  const [wakePhase, setWakePhase] = useState<WakeCommandState["phase"]>("idle");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnimationLoading, setIsAnimationLoading] = useState(false);

  const shellRef = useRef<HTMLElement | null>(null);
  const boardRef = useRef(board);
  const recentTurnsRef = useRef(recentTurns);
  const sessionCache = useRef<Map<string, WhiteboardSession>>(new Map());
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const microphoneStream = useRef<MediaStream | null>(null);
  const transcriptionSocket = useRef<WebSocket | null>(null);
  const transcriptionSessionId = useRef(0);
  const boardSessionId = useRef(0);
  const generationInFlight = useRef(false);
  const generationAbortController = useRef<AbortController | null>(null);
  const generationRequestId = useRef(0);
  const visualJobControllers = useRef<Map<string, AbortController>>(new Map());
  const dispatchTurnRef = useRef<((input: string, sequence?: number) => void) | null>(null);
  const ordinaryTurnQueue = useRef<QueuedLiveTurn[]>([]);
  const turnSequence = useRef(0);
  const lastFinalizedSpeech = useRef<FinalizedSpeechTurn | null>(null);
  const wakeCommandState = useRef<WakeCommandState>(IDLE_WAKE_COMMAND_STATE);
  const wakeExpiryTimer = useRef<number | null>(null);
  const sceneAnimationSequence = useRef(0);

  const selectedLesson = useMemo(
    () => lessons.find((lesson) => lesson.id === selectedLessonId) ?? null,
    [lessons, selectedLessonId]
  );

  /** A revision restarts dismissal even when two consecutive notices have identical copy. */
  const showNotice = useCallback((message: string) => {
    setNotice(message);
    setNoticeRevision((current) => current + 1);
  }, []);

  const commitBoard = useCallback((next: WhiteboardState) => {
    boardRef.current = next;
    setBoard(next);
  }, []);

  const commitRecentTurns = useCallback((next: RecentTurn[]) => {
    recentTurnsRef.current = next;
    setRecentTurns(next);
  }, []);

  const commitTurnSequence = useCallback((next: number) => {
    turnSequence.current = next;
    setTurnSequenceValue(next);
  }, []);

  useEffect(() => {
    const loaded = loadLessonLibrary(window.localStorage);
    const restored = loadWhiteboardSessionStore(window.localStorage, loaded.map((lesson) => lesson.id));
    const restoredSessions = new Map(restored.value.sessions.map((session) => [session.lessonId, session]));
    const selectedLessonId = restored.value.selectedLessonId;
    const selectedSession = restoredSessions.get(selectedLessonId) ?? createEmptyWhiteboardSession(selectedLessonId);
    restoredSessions.set(selectedLessonId, selectedSession);
    sessionCache.current = restoredSessions;
    setLessons(loaded);
    setSelectedLessonId(selectedLessonId);
    setActiveTab(restored.value.activeTab);
    commitBoard(selectedSession.board);
    commitRecentTurns(selectedSession.recentTurns);
    commitTurnSequence(selectedSession.turnSequence);
    setSessionStorageNotice(restored.ok ? "" : restored.message);
    setWorkspaceReady(true);
  }, [commitBoard, commitRecentTurns, commitTurnSequence]);

  useEffect(() => {
    if (!workspaceReady) return;
    const result = saveLessonLibrary(window.localStorage, lessons);
    setLibraryStorageNotice(result.ok ? "" : result.message);
  }, [lessons, workspaceReady]);

  useEffect(() => {
    if (!workspaceReady) return;
    sessionCache.current.set(selectedLessonId, {
      lessonId: selectedLessonId,
      board: boardRef.current,
      recentTurns: recentTurnsRef.current,
      turnSequence: turnSequenceValue,
      updatedAt: new Date().toISOString()
    });
    const result = saveWhiteboardSessionStore(window.localStorage, {
      activeTab,
      selectedLessonId,
      sessions: [...sessionCache.current.values()]
    });
    setSessionStorageNotice(result.ok ? "" : result.message);
  }, [activeTab, board, recentTurns, selectedLessonId, sessionRevision, turnSequenceValue, workspaceReady]);

  /** Success, queue, and restore feedback is temporary; errors and live speech use separate state. */
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      setNotice((current) => current === notice ? "" : current);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [notice, noticeRevision]);

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(".dashboard-reveal", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.05, ease: "power3.out" });
  }, { scope: shellRef, dependencies: [activeTab] });

  const setWakeCommandState = useCallback((next: WakeCommandState) => {
    wakeCommandState.current = next;
    setWakePhase(next.phase);
    if (wakeExpiryTimer.current !== null) window.clearTimeout(wakeExpiryTimer.current);
    wakeExpiryTimer.current = null;
    if (next.phase === "idle") return;
    wakeExpiryTimer.current = window.setTimeout(() => {
      if (wakeCommandState.current.expiresAt !== next.expiresAt) return;
      wakeCommandState.current = IDLE_WAKE_COMMAND_STATE;
      setWakePhase("idle");
      wakeExpiryTimer.current = null;
    }, Math.max(0, next.expiresAt - Date.now()));
  }, []);

  /** Clear both wake activation and duplicate suppression at every speech boundary. */
  const resetSpeechCommandState = useCallback(() => {
    lastFinalizedSpeech.current = null;
    setWakeCommandState(IDLE_WAKE_COMMAND_STATE);
    setLiveTranscript("");
  }, [setWakeCommandState]);

  const dispatchFinalizedTranscript = useCallback((transcript: string) => {
    const cleanTranscript = transcript.trim();
    if (!cleanTranscript) return;
    const now = Date.now();
    if (isDuplicateFinalizedSpeech(lastFinalizedSpeech.current, cleanTranscript, now)) {
      setLiveTranscript("");
      return;
    }
    lastFinalizedSpeech.current = { transcript: cleanTranscript, at: now };
    const result = consumeWakeCommand(wakeCommandState.current, cleanTranscript, now);
    setWakeCommandState(result.state);
    setLiveTranscript("");
    if (result.command) dispatchTurnRef.current?.(result.command);
  }, [setWakeCommandState]);

  const cleanupTranscription = useCallback((sendStop: boolean) => {
    const recorder = mediaRecorder.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    mediaRecorder.current = null;
    microphoneStream.current?.getTracks().forEach((track) => track.stop());
    microphoneStream.current = null;
    const socket = transcriptionSocket.current;
    if (socket) {
      if (sendStop && socket.readyState === WebSocket.OPEN) {
        socket.send("__stop__");
        socket.close(1000, "Microphone stopped");
      } else if (socket.readyState !== WebSocket.CLOSED) socket.close();
    }
    transcriptionSocket.current = null;
  }, []);

  const stopTranscription = useCallback(() => {
    transcriptionSessionId.current += 1;
    cleanupTranscription(true);
    resetSpeechCommandState();
    setSpeechStatus("idle");
    setSpeechNotice("");
  }, [cleanupTranscription, resetSpeechCommandState]);

  const failTranscription = useCallback((message: string, sessionId: number) => {
    if (transcriptionSessionId.current !== sessionId) return;
    transcriptionSessionId.current += 1;
    cleanupTranscription(false);
    resetSpeechCommandState();
    setSpeechStatus("idle");
    setSpeechNotice("");
    setError(message);
  }, [cleanupTranscription, resetSpeechCommandState]);

  const startTranscription = useCallback(async () => {
    if (frontendOnly) return;
    if (speechStatus !== "idle") {
      stopTranscription();
      return;
    }
    resetSpeechCommandState();
    setError("");
    setNotice("");
    setSpeechNotice("Checking microphone transcription…");
    setSpeechStatus("connecting");
    const sessionId = transcriptionSessionId.current + 1;
    transcriptionSessionId.current = sessionId;
    const ownsSession = () => transcriptionSessionId.current === sessionId;
    let sessionConnected = false;
    let sessionStream: MediaStream | null = null;
    let sessionSocket: WebSocket | null = null;
    let sessionRecorder: MediaRecorder | null = null;
    const releaseSessionResources = () => {
      if (sessionRecorder && sessionRecorder.state !== "inactive") sessionRecorder.stop();
      sessionStream?.getTracks().forEach((track) => track.stop());
      if (sessionSocket && sessionSocket.readyState !== WebSocket.CLOSED) sessionSocket.close();
    };

    try {
      const status = await fetchDeepgramStatus();
      if (!ownsSession()) return;
      if (!status.configured || status.apiKeyStatus === "missing") throw new Error("DEEPGRAM_API_KEY is not configured in .env.");
      if (status.apiKeyStatus !== "valid") throw new Error(status.apiKeyMessage);
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone capture is not supported in this browser.");
      setSpeechNotice("Requesting microphone access…");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: true, echoCancellation: true, noiseSuppression: true } });
      sessionStream = stream;
      if (!ownsSession()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      microphoneStream.current = stream;
      const socket = new WebSocket(getTranscriptionWsUrl());
      sessionSocket = socket;
      transcriptionSocket.current = socket;
      const connectionTimeout = window.setTimeout(() => {
        if (!ownsSession()) return;
        if (!sessionConnected && socket.readyState !== WebSocket.CLOSED) failTranscription("Transcription did not connect within 6 seconds.", sessionId);
      }, 6000);

      const startRecorder = () => {
        if (!ownsSession() || sessionRecorder) return;
        const mimeType = getPreferredAudioMimeType();
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        sessionRecorder = recorder;
        if (!ownsSession()) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        mediaRecorder.current = recorder;
        recorder.ondataavailable = (event) => {
          if (!ownsSession() || event.data.size === 0 || socket.readyState !== WebSocket.OPEN) return;
          void event.data.arrayBuffer().then((buffer) => {
            if (ownsSession() && sessionSocket === socket && socket.readyState === WebSocket.OPEN) socket.send(buffer);
          });
        };
        if (!ownsSession()) return;
        recorder.start(250);
        setSpeechStatus("listening");
        setSpeechNotice("");
      };

      socket.onopen = () => {
        if (!ownsSession()) return;
        setSpeechNotice("Connecting transcription…");
      };
      socket.onmessage = (event) => {
        if (!ownsSession()) return;
        let data: DeepgramMessage;
        try { data = JSON.parse(event.data as string) as DeepgramMessage; } catch { return; }
        if (data.type === "Error") {
          window.clearTimeout(connectionTimeout);
          failTranscription(getDeepgramFailureMessage(data), sessionId);
          return;
        }
        if (data.type === "Status") {
          if (data.status === "connected") {
            sessionConnected = true;
            window.clearTimeout(connectionTimeout);
            startRecorder();
          } else if (data.status === "connecting_to_deepgram") setSpeechNotice("Connecting transcription…");
          return;
        }
        if (data.type === "TurnInfo") {
          const transcript = data.transcript?.trim() ?? "";
          setLiveTranscript(transcript);
          if (data.event === "EndOfTurn") dispatchFinalizedTranscript(transcript);
          return;
        }
        const transcript = data.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
        if (data.type === "Results" && transcript) {
          setLiveTranscript(transcript);
          if (data.speech_final) dispatchFinalizedTranscript(transcript);
        }
      };
      socket.onerror = () => {
        if (!ownsSession()) return;
        window.clearTimeout(connectionTimeout);
        failTranscription("Transcription websocket connection failed.", sessionId);
      };
      socket.onclose = () => {
        if (!ownsSession()) return;
        window.clearTimeout(connectionTimeout);
        failTranscription(sessionConnected ? "Transcription websocket closed unexpectedly." : "Transcription websocket closed before connecting.", sessionId);
      };
    } catch (speechError) {
      if (!ownsSession()) {
        releaseSessionResources();
        return;
      }
      failTranscription(speechError instanceof Error ? speechError.message : "Microphone streaming failed.", sessionId);
    }
  }, [dispatchFinalizedTranscript, failTranscription, frontendOnly, resetSpeechCommandState, speechStatus, stopTranscription]);

  useEffect(() => () => stopTranscription(), [stopTranscription]);
  useEffect(() => () => {
    generationAbortController.current?.abort();
    visualJobControllers.current.forEach((controller) => controller.abort());
    visualJobControllers.current.clear();
  }, []);

  const pollVisualJob = useCallback(async (jobId: string, sceneId: string, sessionId: number) => {
    if (frontendOnly) return;
    const controller = new AbortController();
    visualJobControllers.current.set(jobId, controller);
    const ownsVisualJob = () => (
      !controller.signal.aborted
      && boardSessionId.current === sessionId
      && visualJobControllers.current.get(jobId) === controller
      && sceneOwnsVisualJob(boardRef.current, sceneId, jobId)
    );
    const settleVisualJob = (asset: VisualJobResponse["generatedAsset"], failed: boolean) => {
      const currentBoard = boardRef.current;
      const settledBoard = patchGeneratedAsset(currentBoard, sceneId, jobId, asset, failed);
      if (settledBoard === currentBoard) return false;
      commitBoard(settledBoard);
      return true;
    };
    const isDiagramJob = () => boardRef.current.scenes
      .find((scene) => scene.sceneId === sceneId)?.contentModes.includes("diagram") === true;
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (!ownsVisualJob()) return;
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        if (!ownsVisualJob()) return;
        const job = await fetchVisualJob(jobId, controller.signal);
        if (!ownsVisualJob()) return;
        if (job.status === "pending") continue;
        if (job.sceneId !== sceneId) return;
        if (!settleVisualJob(job.generatedAsset, job.status === "failed")) return;
        if (job.warning) setWarning(job.warning);
        return;
      }
      if (ownsVisualJob()) {
        const diagramJob = isDiagramJob();
        if (!settleVisualJob(null, true)) return;
        setWarning(diagramJob
          ? "The diagram timed out before it could be generated."
          : "The visual timed out before it could be generated.");
      }
    } catch (jobError) {
      if (ownsVisualJob()) {
        const diagramJob = isDiagramJob();
        if (!settleVisualJob(null, true)) return;
        setWarning(jobError instanceof Error
          ? jobError.message
          : diagramJob ? "The diagram could not be generated." : "The visual could not be generated.");
      }
    } finally {
      if (visualJobControllers.current.get(jobId) === controller) visualJobControllers.current.delete(jobId);
    }
  }, [commitBoard, frontendOnly]);

  const runGeneration = useCallback(async (turn: QueuedLiveTurn) => {
    if (frontendOnly || !turn.input.trim() || generationInFlight.current) return;
    const sessionId = boardSessionId.current;
    const requestId = generationRequestId.current + 1;
    generationRequestId.current = requestId;
    const controller = new AbortController();
    generationAbortController.current?.abort();
    generationAbortController.current = controller;
    generationInFlight.current = true;
    setIsGenerating(true);
    setIsAnimationLoading(requestsAnimation(turn.input));
    setError("");
    setWarning("");
    setNotice("");

    const context = lessons.find((lesson) => lesson.id === selectedLessonId);
    const request: GenerateRequest = {
      userInput: turn.input.slice(0, 4000),
      mode: "live",
      turnSequence: turn.sequence,
      lessonContext: context
        ? { title: context.title, subject: context.subject, source: context.source }
        : { title: "", subject: "", source: "" },
      recentTurns: recentTurnsRef.current,
      concepts: getConceptMemory(boardRef.current),
      board: getBoardDigest(boardRef.current)
    };

    try {
      const decision = await streamGeneration(request, {}, controller.signal);
      if (controller.signal.aborted || boardSessionId.current !== sessionId || generationRequestId.current !== requestId || decision.turnSequence !== turn.sequence) return;
      const nextBoard = applyBoardDecision(boardRef.current, decision);
      if (!nextBoard) {
        setWarning("A stale board decision was ignored. Please try that thought again.");
        return;
      }
      commitRecentTurns(appendRecentTurn(recentTurnsRef.current, decision, turn.input));
      const committedSceneId = decision.targetSceneId ?? decision.sceneId;
      const previousScene = boardRef.current.scenes.find((scene) => scene.sceneId === committedSceneId);
      const acceptedScene = nextBoard.scenes.find((scene) => scene.sceneId === committedSceneId);
      const changedBlocks: SceneAnimationBlock[] = [];
      const changedNoteBulletIndexes = acceptedScene?.contentModes.includes("notes")
        ? getChangedSummaryBulletIndexes(previousScene?.summaryBullets, acceptedScene.summaryBullets)
        : [];
      if (acceptedScene?.headingMode === "show" && (
        !previousScene
        || previousScene.headingMode !== "show"
        || previousScene.title !== acceptedScene.title
      )) changedBlocks.push("heading");
      if (changedNoteBulletIndexes.length) changedBlocks.push("notes");
      cancelRemovedVisualJobs(boardRef.current, nextBoard, visualJobControllers.current);
      cancelSupersededVisualJob(boardRef.current, nextBoard, committedSceneId, visualJobControllers.current);
      commitBoard(nextBoard);
      if (shouldAnimateDiagramNotesExpansion(previousScene, acceptedScene, decision)) {
        sceneAnimationSequence.current += 1;
        setSceneAnimation({
          kind: "expandDiagramNotes",
          sceneId: committedSceneId,
          revision: sceneAnimationSequence.current,
          noteBulletIndexes: changedNoteBulletIndexes
        });
      } else if (changedBlocks.length) {
        sceneAnimationSequence.current += 1;
        setSceneAnimation({
          kind: "reveal",
          sceneId: committedSceneId,
          revision: sceneAnimationSequence.current,
          blocks: changedBlocks,
          noteBulletIndexes: changedNoteBulletIndexes
        });
      } else {
        setSceneAnimation(null);
      }
      showNotice(`${decision.boardStrategy === "reset" ? "Started a new board with" : decision.action === "create" ? "Added" : "Updated"} ${decision.title}.`);
      if (decision.visualJobId) void pollVisualJob(decision.visualJobId, committedSceneId, sessionId);
      if (decision.warning) setWarning(decision.warning);
    } catch (requestError) {
      if (!controller.signal.aborted && boardSessionId.current === sessionId) {
        setError(requestError instanceof Error ? requestError.message : "The generation request could not be completed.");
      }
    } finally {
      if (boardSessionId.current === sessionId && generationRequestId.current === requestId) {
        generationInFlight.current = false;
        generationAbortController.current = null;
        setIsGenerating(false);
        setIsAnimationLoading(false);
        if (!frontendOnly) {
          const next = dequeueLiveTurn(ordinaryTurnQueue.current);
          if (next) window.queueMicrotask(() => dispatchTurnRef.current?.(next.input, next.sequence));
        }
      }
    }
  }, [commitBoard, commitRecentTurns, frontendOnly, lessons, pollVisualJob, selectedLessonId, showNotice]);

  const dispatchTeachingTurn = useCallback((rawInput: string, existingSequence?: number) => {
    if (frontendOnly) return;
    const input = rawInput.trim();
    if (!input) return;
    const sequence = existingSequence ?? turnSequence.current + 1;
    commitTurnSequence(Math.max(turnSequence.current, sequence));
    setLiveTranscript("");
    setError("");
    const turn = { input, sequence };
    if (generationInFlight.current) {
      enqueueLiveTurn(ordinaryTurnQueue.current, turn);
      showNotice(`Queued live speech (${ordinaryTurnQueue.current.length} waiting).`);
      return;
    }
    void runGeneration(turn);
  }, [commitTurnSequence, frontendOnly, runGeneration, showNotice]);

  useEffect(() => { dispatchTurnRef.current = dispatchTeachingTurn; }, [dispatchTeachingTurn]);

  /** End work that belongs to the outgoing lesson without touching its durable state. */
  const cancelLiveTransients = useCallback(() => {
    boardSessionId.current += 1;
    generationRequestId.current += 1;
    generationAbortController.current?.abort();
    generationAbortController.current = null;
    visualJobControllers.current.forEach((controller) => controller.abort());
    visualJobControllers.current.clear();
    generationInFlight.current = false;
    ordinaryTurnQueue.current = [];
    stopTranscription();
    setCapturedInput("");
    setLiveTranscript("");
    setIsGenerating(false);
    setIsAnimationLoading(false);
    setError("");
    setWarning("");
    setSceneAnimation(null);
  }, [stopTranscription]);

  /** Store an outgoing lesson only after cancelled image jobs reach a terminal state. */
  const snapshotCurrentSession = useCallback(() => {
    const settledBoard = settlePendingVisualJobs(boardRef.current);
    if (settledBoard !== boardRef.current) commitBoard(settledBoard);
    sessionCache.current.set(selectedLessonId, {
      lessonId: selectedLessonId,
      board: settledBoard,
      recentTurns: recentTurnsRef.current,
      turnSequence: turnSequence.current,
      updatedAt: new Date().toISOString()
    });
  }, [commitBoard, selectedLessonId]);

  /** Snapshot the mounted board, then restore the selected lesson as one transaction. */
  const activateLesson = useCallback((lessonId: string, snapshotOutgoing = true) => {
    if (snapshotOutgoing) snapshotCurrentSession();
    cancelLiveTransients();
    const session = sessionCache.current.get(lessonId) ?? createEmptyWhiteboardSession(lessonId);
    sessionCache.current.set(lessonId, session);
    commitBoard(session.board);
    commitRecentTurns(session.recentTurns);
    commitTurnSequence(session.turnSequence);
    setSelectedLessonId(lessonId);
    showNotice(lessonId ? "Lesson whiteboard restored." : "No-context whiteboard restored.");
    setActiveTab("live");
  }, [cancelLiveTransients, commitBoard, commitRecentTurns, commitTurnSequence, showNotice, snapshotCurrentSession]);

  /** Fresh board is the only educator action that erases a session. */
  const startFreshWhiteboard = useCallback((lessonId = selectedLessonId) => {
    if (lessonId !== selectedLessonId) snapshotCurrentSession();
    cancelLiveTransients();
    const blank = createEmptyWhiteboardSession(lessonId);
    sessionCache.current.set(lessonId, blank);
    commitBoard(blank.board);
    commitRecentTurns([]);
    commitTurnSequence(0);
    setSelectedLessonId(lessonId);
    showNotice(lessonId ? "Lesson context armed on a fresh whiteboard." : "Fresh whiteboard ready.");
    setActiveTab("live");
  }, [cancelLiveTransients, commitBoard, commitRecentTurns, commitTurnSequence, selectedLessonId, showNotice, snapshotCurrentSession]);

  function saveLessonContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = lessonTitle.trim();
    const source = lessonSource.trim();
    if (!title || !source) {
      setError("Add a lesson title and the material you plan to teach.");
      return;
    }
    const now = new Date().toISOString();
    const lesson: LessonContextRecord = {
      schemaVersion: 2,
      id: createLessonId(),
      title: title.slice(0, 160),
      subject: lessonSubject.trim().slice(0, 120),
      source: source.slice(0, 3600),
      createdAt: now,
      updatedAt: now
    };
    setLessons((current) => upsertLesson(current, lesson));
    sessionCache.current.set(lesson.id, createEmptyWhiteboardSession(lesson.id));
    activateLesson(lesson.id);
  }

  function deleteLesson(lessonId: string) {
    const next = removeLesson(lessons, lessonId);
    setLessons(next);
    sessionCache.current.delete(lessonId);
    if (selectedLessonId === lessonId) activateLesson(next[0]?.id ?? "", false);
    else setSessionRevision((current) => current + 1);
  }

  function selectTab(tab: DashboardTab) {
    if (tab !== "live") {
      stopTranscription();
      setCapturedInput("");
      setLiveTranscript("");
      setSceneAnimation(null);
    }
    setActiveTab(tab);
    setError("");
    setNotice("");
  }

  function handleLiveSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (frontendOnly) return;
    const typedCommand = capturedInput.trim();
    if (!typedCommand) return;
    setCapturedInput("");
    dispatchTeachingTurn(typedCommand);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  const speechStateLabel = speechStatus === "idle"
    ? "Microphone off"
    : speechStatus === "connecting"
      ? "Connecting microphone"
      : wakePhase === "armed"
        ? "Armed — say one command"
        : wakePhase === "heardHey"
          ? "Wake phrase started — say Imagine"
          : "Listening for “Hey Imagine”";
  const pageCount = Math.max(1, ...board.scenes.map((scene) => scene.placement.page));
  const currentPage = Math.min(board.currentPage, pageCount);

  if (activeTab === "live") {
    return (
      <main ref={shellRef} className="flex h-[100dvh] min-h-[100dvh] w-full flex-col overflow-hidden bg-[#fffdf7] text-neutral-950">
        <a href="#live-board" className="fixed left-3 top-3 z-[100] -translate-y-[calc(100%+28px)] rounded-md bg-[var(--signal)] px-4 py-3 font-semibold text-[var(--signal-ink)] transition-transform focus-visible:translate-y-0">Skip to whiteboard</a>
        <header className="fixed inset-x-2 top-[max(0.5rem,env(safe-area-inset-top))] z-40 flex items-center gap-2 rounded-2xl bg-white/65 px-2 py-1.5 shadow-[0_8px_32px_rgba(92,78,49,0.08)] backdrop-blur-xl sm:inset-x-4 sm:px-3">
          <button type="button" onClick={() => selectTab("library")} aria-label="Exit live whiteboard and return to library" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-2 text-sm font-semibold transition-colors hover:bg-white/70 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)] sm:px-3"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Exit</span></button>
          <h1 className="min-w-0 flex-1 truncate px-1 text-base font-semibold sm:text-lg">{selectedLesson?.title ?? "Live whiteboard"}</h1>
          {pageCount > 1 ? (
            <nav aria-label="Whiteboard pages" className="flex shrink-0 items-center gap-1">
              <button type="button" aria-label="Previous whiteboard page" disabled={currentPage <= 1} onClick={() => commitBoard({ ...boardRef.current, currentPage: currentPage - 1 })} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/70 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]"><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-12 text-center font-[var(--mono)] text-xs tabular-nums">{currentPage}/{pageCount}</span>
              <button type="button" aria-label="Next whiteboard page" disabled={currentPage >= pageCount} onClick={() => commitBoard({ ...boardRef.current, currentPage: currentPage + 1 })} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/70 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]"><ChevronRight className="h-4 w-4" /></button>
            </nav>
          ) : null}
          <details className="group relative shrink-0">
            <summary aria-label="Open live whiteboard options" className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-xl hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]"><MoreMenuIcon /></summary>
            <div className="absolute right-0 top-12 z-50 w-[min(19rem,calc(100vw-1rem))] rounded-2xl bg-white/90 p-3 shadow-[0_18px_55px_rgba(70,60,40,0.16)] backdrop-blur-xl">
              <label className="text-xs font-semibold text-neutral-600">Lesson whiteboard<select value={selectedLessonId} onChange={(event) => activateLesson(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900"><option value="">No lesson context</option>{lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label>
              <button type="button" onClick={() => startFreshWhiteboard(selectedLessonId)} className="mt-3 h-10 w-full rounded-md border border-neutral-200 text-sm font-semibold hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]">Start fresh board</button>
              <button type="button" onClick={() => selectTab("library")} className="mt-1 h-10 w-full rounded-md text-sm font-semibold hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]">Open lesson library</button>
            </div>
          </details>
        </header>

        <StatusBanner error={error} warning={warning || sessionStorageNotice || libraryStorageNotice} notice={notice || speechNotice} />
        {frontendOnly ? <div id="frontend-only-notice" role="status" aria-live="polite" className="fixed left-1/2 top-[132px] z-30 w-[min(calc(100%-32px),720px)] -translate-x-1/2 rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-2 text-center text-sm font-medium text-amber-950 shadow-sm">{FRONTEND_ONLY_NOTICE}</div> : null}
        <section id="live-board" className="min-h-0 flex-1">
          <LiveWhiteboard board={board} animationRequest={sceneAnimation} isAnimationLoading={isAnimationLoading} />
        </section>

        <form onSubmit={handleLiveSubmit} aria-describedby={frontendOnly ? "frontend-only-notice" : undefined} className="fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-2 right-2 z-40 mx-auto flex w-[min(820px,calc(100%-1rem))] items-end gap-1.5 rounded-2xl bg-white/75 p-1.5 shadow-[0_18px_60px_rgba(70,60,40,0.16)] backdrop-blur-xl sm:gap-2 sm:p-2">
          <div className="min-w-0 flex-1">
            {(speechStatus !== "idle" || wakePhase !== "idle" || liveTranscript || isGenerating) ? <div id="speech-command-status" role="status" aria-live="polite" className="flex h-6 min-w-0 items-center gap-2 truncate px-3 text-xs text-neutral-600"><span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${wakePhase === "armed" ? "bg-emerald-500" : speechStatus === "listening" ? "bg-amber-500" : "bg-neutral-400"}`} /><span className="truncate">{isGenerating ? "Preparing board update…" : liveTranscript ? `Heard: ${liveTranscript}` : speechStateLabel}</span></div> : null}
            <label htmlFor="workspace-input" className="sr-only">Typed teaching command</label>
            <Textarea id="workspace-input" aria-describedby={frontendOnly ? "frontend-only-notice" : "speech-command-status"} disabled={frontendOnly} value={capturedInput} onChange={(event) => setCapturedInput(event.target.value)} onKeyDown={handleInputKeyDown} placeholder={frontendOnly ? "Live generation is unavailable on this deployment." : "Teach the next idea… Try “animate the water cycle”."} maxLength={4000} rows={1} className="min-h-12 w-full resize-none rounded-lg border-0 bg-transparent px-3 py-3 text-base text-black caret-black shadow-none placeholder:text-neutral-600 focus-visible:ring-2 focus-visible:ring-[var(--signal)] disabled:cursor-not-allowed disabled:opacity-70" />
          </div>
          <Button type="submit" disabled={frontendOnly || !capturedInput.trim()} aria-label="Submit typed teaching command" className="h-12 w-11 shrink-0 rounded-lg bg-[var(--signal)] px-0 text-[var(--signal-ink)] hover:bg-[var(--signal)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 sm:w-12">{isGenerating ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> : <ArrowUp className="h-5 w-5" />}</Button>
          <Button type="button" disabled={frontendOnly} onClick={() => void startTranscription()} aria-label={frontendOnly ? "Microphone unavailable on this frontend-only deployment" : speechStatus === "idle" ? "Start microphone" : "Stop microphone"} className={`h-12 w-11 shrink-0 rounded-lg px-0 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 sm:w-12 ${speechStatus === "idle" ? "bg-[var(--canvas-text)] text-[var(--canvas-bg)]" : "bg-red-600 text-white"}`}>{speechStatus === "connecting" ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> : speechStatus === "listening" ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</Button>
        </form>
      </main>
    );
  }

  return (
    <main ref={shellRef} className="dashboard-root min-h-dvh w-full max-w-full overflow-x-hidden bg-[var(--page)] text-[var(--text)]">
      <a href="#workspace" className="fixed left-3 top-3 z-[100] -translate-y-[calc(100%+28px)] rounded-md bg-[var(--signal)] px-4 py-3 font-semibold text-[var(--signal-ink)] transition-transform focus-visible:translate-y-0">Skip to workspace</a>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto flex h-[68px] max-w-[1680px] items-center gap-5 px-4 sm:px-6">
          <div className="inline-flex shrink-0 items-center gap-3 font-[820]" aria-label="Imagine educator workspace">
            <span className="relative h-[30px] w-[30px]" aria-hidden="true">
              <Image src="/brand/imagineer-shortform.png" alt="" width={30} height={30} className="brand-logo-dark absolute inset-0 rounded-[7px]" />
              <Image src="/brand/imagineer-shortform-light.png" alt="" width={30} height={30} className="brand-logo-light absolute inset-0 rounded-[7px]" />
            </span>
            <span className="hidden sm:inline">IMAGINE V1</span>
          </div>
          <nav className="mx-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--page-deep)] p-1" aria-label="Workspace views">
            {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => selectTab(id)} aria-current={activeTab === id ? "page" : undefined} className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold ${activeTab === id ? "bg-[var(--signal)] text-[var(--signal-ink)]" : "text-[var(--text-soft)] hover:bg-[var(--panel-strong)]"}`}><Icon className="h-4 w-4" aria-hidden="true" />{label}</button>)}
          </nav>
        </div>
      </header>

      <StatusBanner error={error} warning={warning || sessionStorageNotice || libraryStorageNotice} notice={notice || speechNotice} />
      <section id="workspace" className="min-h-dvh bg-[var(--canvas-bg)] px-[max(16px,3.5vw)] pb-40 pt-[104px] text-[var(--canvas-text)] sm:pb-32">
        {activeTab === "prepare" ? (
          <div className="dashboard-reveal mx-auto grid max-w-[1300px] gap-5 lg:grid-cols-[minmax(0,520px)_1fr]">
            <form onSubmit={saveLessonContext} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6 lg:p-8">
              <p className="font-[var(--mono)] text-xs uppercase tracking-[0.12em] text-[var(--text-soft)]">Context only — no generation</p>
              <h1 className="mt-5 text-4xl leading-none">Prepare lesson context</h1>
              <p className="mt-4 text-sm leading-6 text-[var(--text-soft)]">Give the Live Assistant the lesson boundaries it should remember.</p>
              <div className="mt-8 space-y-5">
                <label className="block text-sm font-semibold">Lesson title<input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} maxLength={160} className="mt-2 h-12 w-full rounded-lg border border-[var(--line)] bg-[var(--page)] px-4 outline-none focus:border-[var(--signal)]" /></label>
                <label className="block text-sm font-semibold">Subject <span className="font-normal text-[var(--text-soft)]">optional</span><input value={lessonSubject} onChange={(event) => setLessonSubject(event.target.value)} maxLength={120} className="mt-2 h-12 w-full rounded-lg border border-[var(--line)] bg-[var(--page)] px-4 outline-none focus:border-[var(--signal)]" /></label>
                <label className="block text-sm font-semibold">Lesson material<Textarea value={lessonSource} onChange={(event) => setLessonSource(event.target.value)} maxLength={3600} rows={12} className="mt-2 min-h-64 resize-y rounded-lg border-[var(--line)] bg-[var(--page)] px-4 py-4" /></label>
              </div>
              <Button type="submit" disabled={!lessonTitle.trim() || !lessonSource.trim()} className="mt-6 h-12 w-full rounded-lg bg-[var(--signal)] text-[var(--signal-ink)] hover:bg-[var(--signal)] hover:opacity-90"><ArrowUp className="mr-2 h-4 w-4" />Save, arm, and enter Live</Button>
            </form>
            <div className="grid min-h-[560px] place-items-center rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel)] p-8 text-center">
              <div><BookOpen className="mx-auto h-9 w-9 text-[var(--signal)]" /><h2 className="mt-5 text-3xl">Context guides each live turn.</h2><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[var(--text-soft)]">The board still begins blank. Visuals accumulate only as teaching happens.</p></div>
            </div>
          </div>
        ) : null}

        {activeTab === "library" ? (
          <div className="dashboard-reveal mx-auto max-w-[1300px]">
            <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-[var(--mono)] text-xs uppercase tracking-[0.12em] text-[var(--text-soft)]">Stored in this browser</p><h1 className="mt-4 text-4xl">Lesson contexts</h1></div><Button onClick={() => selectTab("prepare")} className="h-12 rounded-lg bg-[var(--signal)] px-6 text-[var(--signal-ink)] hover:bg-[var(--signal)]"><Plus className="mr-2 h-4 w-4" />New context</Button></div>
            {lessons.length ? <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{lessons.map((lesson) => (
              <article key={lesson.id} className="flex min-h-72 flex-col rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6">
                <div className="flex justify-between"><span className="font-[var(--mono)] text-xs uppercase tracking-wider text-[var(--text-soft)]">Context</span><button type="button" onClick={() => deleteLesson(lesson.id)} aria-label={`Delete ${lesson.title}`} className="grid h-9 w-9 place-items-center rounded-md text-[var(--text-soft)] hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button></div>
                <div className="mt-auto pt-10"><p className="text-sm text-[var(--text-soft)]">{lesson.subject || "General lesson"}</p><h2 className="mt-3 text-3xl leading-none">{lesson.title}</h2><p className="mt-4 line-clamp-3 text-sm leading-6 text-[var(--text-soft)]">{lesson.source}</p></div>
                <button type="button" onClick={() => activateLesson(lesson.id)} className="mt-6 rounded-lg bg-[var(--signal)] px-4 py-3 text-sm font-semibold text-[var(--signal-ink)]">Open saved whiteboard</button>
              </article>
            ))}</div> : <div className="mt-12 grid min-h-96 place-items-center rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel)] text-center"><div><Library className="mx-auto h-8 w-8 text-[var(--signal)]" /><h2 className="mt-5 text-3xl">No lesson contexts yet.</h2></div></div>}
          </div>
        ) : null}

      </section>
    </main>
  );
}
