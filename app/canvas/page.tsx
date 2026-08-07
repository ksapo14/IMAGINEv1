"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowLeft,
  ArrowUp,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Command,
  LayoutDashboard,
  Library,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Presentation,
  Sparkles,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  CompositionCard,
  CompositionView,
  paletteClasses
} from "@/components/workspace/composition-view";
import type {
  CompositionBlock,
  DeepgramMessage,
  DeepgramStatusResponse,
  GenerateResponse,
  LessonPack,
  SpeechStatus,
  VisualJobResponse
} from "@/components/workspace/types";
import {
  findPreparedVisual,
  getDuplicateRecallPhrases,
  getPreparedVisuals,
  loadLessonLibrary,
  normalizeRecallPhrase,
  parseRecallCommand,
  removeLesson,
  saveLessonLibrary,
  upsertLesson,
  withBlockRecallPhrases
} from "@/lib/lesson-library";
import {
  API_BASE_URL,
  extractReadableDraft,
  streamGeneration
} from "@/lib/generation-stream";

gsap.registerPlugin(ScrollTrigger);

type DashboardTab = "overview" | "prepare" | "library" | "teach" | "live";

type PreparedLessonMeta = {
  id: string;
  title: string;
  subject: string;
  source: string;
  createdAt: string;
};

const tabs: Array<{
  id: DashboardTab;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "prepare", label: "Prepare", icon: Sparkles },
  { id: "library", label: "Library", icon: Library },
  { id: "teach", label: "Teach", icon: Presentation },
  { id: "live", label: "Live canvas", icon: BookOpen }
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
  if (typeof MediaRecorder === "undefined") {
    return "";
  }
  return (
    ["audio/webm;codecs=opus", "audio/webm"].find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType)
    ) ?? ""
  );
}

function getDeepgramFailureMessage(message: DeepgramMessage) {
  return (
    message.message ??
    message.description ??
    message.code ??
    "Speech transcription failed."
  );
}

async function fetchDeepgramStatus() {
  const response = await fetch(getTranscriptionStatusUrl(), {
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) {
    throw new Error("The local backend could not check transcription status.");
  }
  return (await response.json()) as DeepgramStatusResponse;
}

async function fetchVisualJob(jobId: string, signal?: AbortSignal) {
  const response = await fetch(`${API_BASE_URL}/api/visual/${jobId}`, {
    cache: "no-store",
    signal
  });
  if (!response.ok) {
    throw new Error("The visual request could not be completed.");
  }
  return (await response.json()) as VisualJobResponse;
}

function createLessonId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function lessonStatus(result: GenerateResponse) {
  if (result.blocks.some((block) => Boolean(block.visualJobId))) {
    return "generating" as const;
  }
  if (
    result.blocks.some(
      (block) =>
        (block.kind === "diagram" || block.kind === "image") && !block.visual
    )
  ) {
    return "partial" as const;
  }
  return "ready" as const;
}

function withVisualJobResult(
  composition: GenerateResponse,
  job: VisualJobResponse
): GenerateResponse {
  return {
    ...composition,
    blocks: composition.blocks.map((block) =>
      block.blockId === job.blockId
        ? {
            ...block,
            visual: job.visual,
            visualJobId: null,
            visualFailed: job.status === "failed"
          }
        : block
    ),
    warning: job.warning ?? composition.warning
  };
}

function withFailedVisualJob(
  composition: GenerateResponse,
  jobId: string
): GenerateResponse {
  return {
    ...composition,
    blocks: composition.blocks.map((block) =>
      block.visualJobId === jobId
        ? { ...block, visualJobId: null, visualFailed: true }
        : block
    )
  };
}

function getLessonPrompt(meta: PreparedLessonMeta) {
  return [
    `Prepare a reusable visual lesson pack titled "${meta.title}".`,
    meta.subject ? `Subject or course: ${meta.subject}.` : "",
    "Use the trusted diagram and image templates. Prioritize the visuals an educator would intentionally recall during instruction.",
    "Give every visual block one to three short, distinct recall phrases that sound natural after 'imagine show me'.",
    "Lesson material:",
    meta.source
  ]
    .filter(Boolean)
    .join("\n\n");
}

function StatusBanner({
  error,
  warning,
  notice
}: {
  error: string;
  warning: string;
  notice: string;
}) {
  const message = error || warning || notice;
  if (!message) {
    return null;
  }
  const tone = error
    ? "border-red-300/50 bg-red-950/90 text-red-100"
    : warning
      ? "border-amber-300/50 bg-amber-950/90 text-amber-100"
      : "border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--panel)_94%,transparent)] text-[var(--text)]";
  return (
    <div
      role={error ? "alert" : "status"}
      className={`fixed left-1/2 top-[82px] z-50 w-[min(calc(100%-32px),620px)] -translate-x-1/2 rounded-xl border px-5 py-3 text-center text-sm shadow-[0_18px_60px_var(--shadow)] backdrop-blur-xl ${tone}`}
    >
      {message}
    </div>
  );
}

function StreamingDraft({ text }: { text: string }) {
  return (
    <section
      aria-live="polite"
      className="dashboard-reveal relative min-h-[420px] overflow-hidden rounded-[1.6rem] border border-[var(--line)] bg-[var(--panel)] p-7 sm:p-10"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--signal),transparent)]" />
      <div className="mb-12 flex items-center justify-between">
        <span className="font-[var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--text-soft)]">
          Live completion
        </span>
        <span className="inline-flex items-center gap-2 text-xs text-[var(--text-soft)]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--signal)]" />
          Writing now
        </span>
      </div>
      <p className="max-w-4xl font-['Satoshi',var(--body)] text-[clamp(2rem,5vw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[var(--text)]">
        {text || "Listening for the first idea…"}
        <span className="ml-1 inline-block h-[0.9em] w-[3px] animate-pulse bg-[var(--signal)] align-[-0.08em]" />
      </p>
    </section>
  );
}

function EmptyCanvas({ onPrepare }: { onPrepare: () => void }) {
  return (
    <section className="dashboard-reveal mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div>
        <p className="mb-4 font-[var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--canvas-muted)]">
          Unplanned moment
        </p>
        <h1 className="max-w-4xl text-balance font-['Satoshi',var(--body)] text-[clamp(2.6rem,6vw,5.3rem)] font-semibold leading-[0.96] tracking-[-0.045em] text-[var(--canvas-text)]">
          Explain anything, then watch the canvas take shape.
        </h1>
        <button
          type="button"
          onClick={onPrepare}
          className="mt-8 text-sm font-semibold text-[var(--canvas-text)] underline decoration-[var(--signal)] decoration-2 underline-offset-8"
        >
          Or prepare the lesson before class
        </button>
      </div>
      <div className="grid grid-flow-dense grid-cols-2 gap-3 rounded-[1.5rem] border border-[var(--line)] bg-[var(--canvas-surface)] p-4">
        <div className="col-span-2 h-24 rounded-2xl bg-[var(--canvas-soft)]" />
        <div className="h-36 rounded-2xl bg-[var(--canvas-soft)] opacity-70" />
        <div className="h-36 rounded-2xl bg-[var(--canvas-soft)] opacity-70" />
        <div className="col-span-2 h-16 rounded-2xl bg-[var(--canvas-soft)]" />
      </div>
    </section>
  );
}

export default function CanvasPage() {
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [lessons, setLessons] = useState<LessonPack[]>([]);
  const [libraryReady, setLibraryReady] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [preparedLessonId, setPreparedLessonId] = useState("");
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonSubject, setLessonSubject] = useState("");
  const [lessonSource, setLessonSource] = useState("");
  const [capturedInput, setCapturedInput] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [streamDraft, setStreamDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [generationWarning, setGenerationWarning] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [speechNotice, setSpeechNotice] = useState("");
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>("idle");
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [presentedBlock, setPresentedBlock] = useState<CompositionBlock | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const shellRef = useRef<HTMLElement | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const microphoneStream = useRef<MediaStream | null>(null);
  const transcriptionSocket = useRef<WebSocket | null>(null);
  const speechStopRequested = useRef(false);
  const deepgramConnected = useRef(false);
  const generationInFlight = useRef(false);
  const generationAbortController = useRef<AbortController | null>(null);
  const generationRequestId = useRef(0);
  const resultOwner = useRef<{ requestId: number; lessonId: string | null } | null>(
    null
  );
  const lessonRequestIds = useRef<Map<string, number>>(new Map());
  const rawStreamDraft = useRef("");
  const activeVisualJobs = useRef<Set<string>>(new Set());
  const visualJobControllers = useRef<Map<string, AbortController>>(new Map());
  const pendingLesson = useRef<PreparedLessonMeta | null>(null);

  const selectedLesson = useMemo(
    () => lessons.find((lesson) => lesson.id === selectedLessonId) ?? null,
    [lessons, selectedLessonId]
  );
  const preparedLesson = useMemo(
    () => lessons.find((lesson) => lesson.id === preparedLessonId) ?? null,
    [lessons, preparedLessonId]
  );
  const highlightedLesson =
    lessons.length > 0 ? lessons[carouselIndex % lessons.length] : null;
  const recallPhrases = useMemo(
    () =>
      lessons.flatMap((lesson) =>
        getPreparedVisuals(lesson).flatMap((block) => block.recallPhrases)
      ),
    [lessons]
  );

  useEffect(() => {
    const loaded = loadLessonLibrary(window.localStorage);
    setLessons(loaded);
    setSelectedLessonId(loaded[0]?.id ?? "");
    setLibraryReady(true);
  }, []);

  useEffect(() => {
    if (!libraryReady) {
      return;
    }
    const write = saveLessonLibrary(window.localStorage, lessons);
    setStorageNotice(write.ok ? "" : write.message);
  }, [lessons, libraryReady]);

  useEffect(() => {
    const meta = pendingLesson.current;
    const owner = resultOwner.current;
    if (!meta || !result || owner?.lessonId !== meta.id) {
      return;
    }
    const now = new Date().toISOString();
    const snapshot: LessonPack = {
      schemaVersion: 1,
      ...meta,
      updatedAt: now,
      status: lessonStatus(result),
      composition: result
    };
    setLessons((current) => upsertLesson(current, snapshot));
    setSelectedLessonId((current) => current || snapshot.id);
    if (snapshot.status !== "generating") {
      pendingLesson.current = null;
    }
  }, [result]);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      gsap.fromTo(
        ".dashboard-reveal",
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.65, stagger: 0.07, ease: "power3.out" }
      );

      if (activeTab === "overview") {
        gsap.fromTo(
          ".hero-word",
          { opacity: 0.14, y: 10 },
          {
            opacity: 1,
            y: 0,
            stagger: 0.08,
            scrollTrigger: {
              trigger: ".dashboard-hero",
              start: "top 35%",
              end: "bottom 55%",
              scrub: 0.6
            }
          }
        );
        const media = gsap.matchMedia();
        media.add("(min-width: 1024px)", () => {
          const chapter = document.querySelector(".overview-chapter");
          const pin = document.querySelector(".overview-pin");
          if (!chapter || !pin) {
            return;
          }
          ScrollTrigger.create({
            trigger: chapter,
            start: "top 100px",
            end: "bottom 55%",
            pin,
            pinSpacing: false
          });
        });
        return () => media.revert();
      }
    },
    { scope: shellRef, dependencies: [activeTab, lessons.length] }
  );

  const appendTranscript = useCallback((transcript: string) => {
    const cleanTranscript = transcript.trim();
    if (!cleanTranscript) {
      return;
    }
    setCapturedInput((current) =>
      current.trim().length > 0
        ? `${current.trimEnd()} ${cleanTranscript}`
        : cleanTranscript
    );
    setLiveTranscript("");
  }, []);

  const cleanupTranscription = useCallback((sendStop: boolean) => {
    const recorder = mediaRecorder.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    mediaRecorder.current = null;
    microphoneStream.current?.getTracks().forEach((track) => track.stop());
    microphoneStream.current = null;

    const socket = transcriptionSocket.current;
    if (socket) {
      if (sendStop && socket.readyState === WebSocket.OPEN) {
        socket.send("__stop__");
        socket.close(1000, "Microphone stopped");
      } else if (socket.readyState !== WebSocket.CLOSED) {
        socket.close();
      }
    }
    transcriptionSocket.current = null;
  }, []);

  const stopTranscription = useCallback(() => {
    speechStopRequested.current = true;
    deepgramConnected.current = false;
    cleanupTranscription(true);
    setLiveTranscript("");
    setSpeechStatus("idle");
    setSpeechNotice("");
  }, [cleanupTranscription]);

  const failTranscription = useCallback(
    (message: string) => {
      if (speechStopRequested.current) {
        return;
      }
      speechStopRequested.current = true;
      deepgramConnected.current = false;
      cleanupTranscription(false);
      setLiveTranscript("");
      setSpeechStatus("idle");
      setSpeechNotice("");
      setError(message);
    },
    [cleanupTranscription]
  );

  const startTranscription = useCallback(async () => {
    if (speechStatus !== "idle") {
      stopTranscription();
      return;
    }

    setError("");
    setNotice("");
    setSpeechNotice("Checking microphone transcription…");
    setSpeechStatus("connecting");
    speechStopRequested.current = false;
    deepgramConnected.current = false;

    try {
      const status = await fetchDeepgramStatus();
      if (!status.configured || status.apiKeyStatus === "missing") {
        throw new Error("DEEPGRAM_API_KEY is not configured in .env.");
      }
      if (status.apiKeyStatus !== "valid") {
        throw new Error(status.apiKeyMessage);
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone capture is not supported in this browser.");
      }

      setSpeechNotice("Requesting microphone access…");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      microphoneStream.current = stream;

      const socket = new WebSocket(getTranscriptionWsUrl());
      transcriptionSocket.current = socket;
      const connectionTimeout = window.setTimeout(() => {
        if (!deepgramConnected.current && socket.readyState !== WebSocket.CLOSED) {
          failTranscription("Transcription did not connect within 6 seconds.");
        }
      }, 6000);

      const startRecorder = () => {
        if (mediaRecorder.current) {
          return;
        }
        const mimeType = getPreferredAudioMimeType();
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
        mediaRecorder.current = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data.size === 0 || socket.readyState !== WebSocket.OPEN) {
            return;
          }
          void event.data.arrayBuffer().then((buffer) => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(buffer);
            }
          });
        };
        recorder.start(250);
        setSpeechStatus("listening");
        setSpeechNotice("");
      };

      socket.onopen = () => setSpeechNotice("Connecting transcription…");
      socket.onmessage = (event) => {
        let data: DeepgramMessage;
        try {
          data = JSON.parse(event.data as string) as DeepgramMessage;
        } catch {
          return;
        }
        if (data.type === "Error") {
          window.clearTimeout(connectionTimeout);
          failTranscription(getDeepgramFailureMessage(data));
          return;
        }
        if (data.type === "Status") {
          if (data.status === "connected") {
            deepgramConnected.current = true;
            window.clearTimeout(connectionTimeout);
            startRecorder();
          } else if (data.status === "connecting_to_deepgram") {
            setSpeechNotice("Connecting transcription…");
          }
          return;
        }
        if (data.type === "TurnInfo") {
          const transcript = data.transcript?.trim() ?? "";
          setLiveTranscript(transcript);
          if (data.event === "EndOfTurn") {
            appendTranscript(transcript);
          }
          return;
        }
        const transcript = data.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
        if (data.type === "Results" && transcript) {
          setLiveTranscript(transcript);
          if (data.speech_final) {
            appendTranscript(transcript);
          }
        }
      };
      socket.onerror = () => {
        window.clearTimeout(connectionTimeout);
        failTranscription("Transcription websocket connection failed.");
      };
      socket.onclose = () => {
        window.clearTimeout(connectionTimeout);
        mediaRecorder.current = null;
        microphoneStream.current?.getTracks().forEach((track) => track.stop());
        microphoneStream.current = null;
        transcriptionSocket.current = null;
        if (!speechStopRequested.current) {
          failTranscription(
            deepgramConnected.current
              ? "Transcription websocket closed unexpectedly."
              : "Transcription websocket closed before connecting."
          );
          return;
        }
        setSpeechStatus("idle");
        setSpeechNotice("");
      };
    } catch (speechError) {
      failTranscription(
        speechError instanceof Error
          ? speechError.message
          : "Microphone streaming failed."
      );
    }
  }, [appendTranscript, failTranscription, speechStatus, stopTranscription]);

  useEffect(() => () => stopTranscription(), [stopTranscription]);
  useEffect(() => {
    const controllers = visualJobControllers.current;
    const jobs = activeVisualJobs.current;
    return () => {
      generationAbortController.current?.abort();
      jobs.clear();
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
    };
  }, []);

  const displayValue = liveTranscript
    ? capturedInput.trim()
      ? `${capturedInput.trimEnd()} ${liveTranscript}`
      : liveTranscript
    : capturedInput;

  const patchVisualBlock = useCallback((
    job: VisualJobResponse,
    requestId: number,
    lessonId: string | null
  ) => {
    setResult((current) =>
      current && resultOwner.current?.requestId === requestId
        ? withVisualJobResult(current, job)
        : current
    );
    if (lessonId) {
      setLessons((current) =>
        current.map((lesson) => {
          if (lesson.id !== lessonId) {
            return lesson;
          }
          const composition = withVisualJobResult(lesson.composition, job);
          const status = lessonStatus(composition);
          if (status !== "generating" && pendingLesson.current?.id === lessonId) {
            pendingLesson.current = null;
          }
          return {
            ...lesson,
            composition,
            status,
            updatedAt: new Date().toISOString()
          };
        })
      );
    }
  }, []);

  const markVisualJobFailed = useCallback((
    jobId: string,
    requestId: number,
    lessonId: string | null
  ) => {
    setResult((current) =>
      current && resultOwner.current?.requestId === requestId
        ? withFailedVisualJob(current, jobId)
        : current
    );
    if (lessonId) {
      setLessons((current) =>
        current.map((lesson) => {
          if (lesson.id !== lessonId) {
            return lesson;
          }
          const composition = withFailedVisualJob(lesson.composition, jobId);
          if (pendingLesson.current?.id === lessonId) {
            pendingLesson.current = null;
          }
          return {
            ...lesson,
            composition,
            status: "partial",
            updatedAt: new Date().toISOString()
          };
        })
      );
    }
  }, []);

  const pollVisualJob = useCallback(
    async (jobId: string, requestId: number, lessonId: string | null) => {
      activeVisualJobs.current.add(jobId);
      const controller = new AbortController();
      visualJobControllers.current.set(jobId, controller);
      try {
        for (let attempt = 0; attempt < 100; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
          if (!activeVisualJobs.current.has(jobId)) {
            return;
          }
          const job = await fetchVisualJob(jobId, controller.signal);
          if (job.status === "pending") {
            continue;
          }
          activeVisualJobs.current.delete(jobId);
          patchVisualBlock(job, requestId, lessonId);
          if (job.warning && resultOwner.current?.requestId === requestId) {
            setGenerationWarning(job.warning);
          }
          return;
        }
        activeVisualJobs.current.delete(jobId);
        markVisualJobFailed(jobId, requestId, lessonId);
        if (resultOwner.current?.requestId === requestId) {
          setGenerationWarning("A visual could not be completed in time.");
        }
      } catch (visualError) {
        if (!controller.signal.aborted) {
          activeVisualJobs.current.delete(jobId);
          markVisualJobFailed(jobId, requestId, lessonId);
          if (resultOwner.current?.requestId === requestId) {
            setGenerationWarning(
              visualError instanceof Error
                ? visualError.message
                : "The visual request could not be completed."
            );
          }
        }
      } finally {
        visualJobControllers.current.delete(jobId);
      }
    },
    [markVisualJobFailed, patchVisualBlock]
  );

  const runGeneration = useCallback(
    async (submittedInput: string) => {
      if (!submittedInput.trim() || generationInFlight.current) {
        return;
      }
      const requestId = generationRequestId.current + 1;
      generationRequestId.current = requestId;
      const lessonId = pendingLesson.current?.id ?? null;
      resultOwner.current = { requestId, lessonId };
      if (lessonId) {
        lessonRequestIds.current.set(lessonId, requestId);
      }
      generationInFlight.current = true;
      generationAbortController.current?.abort();
      const controller = new AbortController();
      generationAbortController.current = controller;
      rawStreamDraft.current = "";
      setStreamDraft("");
      setError("");
      setNotice("");
      setGenerationWarning("");
      setResult(null);
      setIsGenerating(true);

      try {
        const generated = await streamGeneration(
          submittedInput,
          {
            onDelta: (delta) => {
              if (generationRequestId.current !== requestId) {
                return;
              }
              rawStreamDraft.current += delta;
              setStreamDraft(extractReadableDraft(rawStreamDraft.current));
            }
          },
          controller.signal
        );
        if (generationRequestId.current !== requestId) {
          return;
        }
        setResult(generated);
        setGenerationWarning(generated.warning ?? "");
        generated.blocks.forEach((block) => {
          if (block.visualJobId) {
            void pollVisualJob(block.visualJobId, requestId, lessonId);
          }
        });
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "The generation request could not be completed."
          );
          pendingLesson.current = null;
        }
      } finally {
        if (generationRequestId.current === requestId) {
          generationInFlight.current = false;
          setIsGenerating(false);
          generationAbortController.current = null;
        }
      }
    },
    [pollVisualJob]
  );

  async function handlePrepareSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = lessonTitle.trim();
    const source = lessonSource.trim();
    if (!title || !source) {
      setError("Add a lesson title and the material you plan to teach.");
      return;
    }
    const createdAt = new Date().toISOString();
    const meta: PreparedLessonMeta = {
      id: createLessonId(),
      title,
      subject: lessonSubject.trim(),
      source,
      createdAt
    };
    pendingLesson.current = meta;
    setPreparedLessonId(meta.id);
    await runGeneration(getLessonPrompt(meta));
  }

  async function handleLiveSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedInput = displayValue.trim();
    if (!submittedInput) {
      return;
    }
    setCapturedInput("");
    setLiveTranscript("");
    pendingLesson.current = null;
    await runGeneration(submittedInput);
  }

  function handleTeachSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedInput = displayValue.trim();
    setCapturedInput("");
    setLiveTranscript("");
    setError("");
    setNotice("");
    if (!selectedLesson) {
      setError("Choose a prepared lesson before teaching.");
      return;
    }
    const phrase = parseRecallCommand(submittedInput);
    if (!phrase) {
      setNotice("Prepared mode only responds to: imagine show me <keyphrase>.");
      return;
    }
    const block = findPreparedVisual(selectedLesson, phrase);
    if (!block) {
      setNotice(`No prepared visual matches “${phrase}”. Nothing was generated.`);
      return;
    }
    setPresentedBlock(block);
    setNotice(`Showing “${block.title || phrase}” from ${selectedLesson.title}.`);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function selectTab(tab: DashboardTab) {
    if (isGenerating && tab !== activeTab) {
      setNotice("Live completion is still writing. Wait for the lesson draft to finish before switching views.");
      return;
    }
    if (tab !== "live" && tab !== "teach") {
      stopTranscription();
      setCapturedInput("");
      setLiveTranscript("");
    }
    setActiveTab(tab);
    resultOwner.current = null;
    setError("");
    setNotice("");
    if (tab === "live") {
      pendingLesson.current = null;
      setResult(null);
    } else if (tab === "prepare" && preparedLesson) {
      const requestId = lessonRequestIds.current.get(preparedLesson.id) ?? -1;
      resultOwner.current = { requestId, lessonId: preparedLesson.id };
      setResult(preparedLesson.composition);
    }
  }

  function openLesson(lesson: LessonPack, destination: "library" | "teach") {
    const requestId = lessonRequestIds.current.get(lesson.id) ?? -1;
    resultOwner.current = { requestId, lessonId: lesson.id };
    setSelectedLessonId(lesson.id);
    setPreparedLessonId(lesson.id);
    setResult(lesson.composition);
    setPresentedBlock(null);
    setActiveTab(destination);
  }

  function deleteLesson(lessonId: string) {
    setLessons((current) => removeLesson(current, lessonId));
    if (selectedLessonId === lessonId) {
      const replacement = lessons.find((lesson) => lesson.id !== lessonId);
      setSelectedLessonId(replacement?.id ?? "");
    }
    if (preparedLessonId === lessonId) {
      setPreparedLessonId("");
    }
  }

  function updateRecallPhrases(
    lesson: LessonPack,
    blockId: string,
    value: string
  ) {
    const phrases = value.split(",").map((phrase) => phrase.trim()).filter(Boolean);
    const updated = withBlockRecallPhrases(lesson, blockId, phrases);
    const duplicates = getDuplicateRecallPhrases(updated.composition.blocks);
    if (duplicates.length > 0) {
      setError(`Recall phrases must be unique. Duplicate: ${duplicates[0]}.`);
      return;
    }
    setError("");
    setLessons((current) => upsertLesson(current, updated));
    if (result && lesson.id === preparedLessonId) {
      setResult(updated.composition);
    }
  }

  const pageTone = result?.theme.palette
    ? paletteClasses[result.theme.palette]
    : "bg-[var(--canvas-bg)] text-[var(--canvas-text)] transition-colors duration-300";
  const showCommandDock = activeTab === "live" || activeTab === "teach";

  return (
    <main
      ref={shellRef}
      className="min-h-dvh w-full max-w-full overflow-x-hidden bg-[var(--page)] text-[var(--text)]"
    >
      <a
        href="#workspace"
        className="fixed left-3 top-3 z-[100] -translate-y-[calc(100%+28px)] rounded bg-[var(--signal)] px-4 py-3 font-semibold text-[var(--signal-ink)] transition-transform focus-visible:translate-y-0"
      >
        Skip to workspace
      </a>

      <header className="fixed inset-x-0 top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--page)_86%,transparent)] backdrop-blur-[20px]">
        <div className="mx-auto flex h-[68px] max-w-[1680px] items-center gap-5 px-4 sm:px-6">
          <Link href="/" className="inline-flex shrink-0 items-center gap-3 font-[820]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="relative h-[30px] w-[30px]" aria-hidden="true">
              <Image
                src="/brand/imagineer-shortform.png"
                alt=""
                width={30}
                height={30}
                className="brand-logo-dark absolute inset-0 rounded-[7px]"
              />
              <Image
                src="/brand/imagineer-shortform-light.png"
                alt=""
                width={30}
                height={30}
                className="brand-logo-light absolute inset-0 rounded-[7px]"
              />
            </span>
            <span className="hidden sm:inline">IMAGINE V1</span>
          </Link>

          <nav className="mx-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] p-1" aria-label="Workspace views">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => selectTab(id)}
                aria-current={activeTab === id ? "page" : undefined}
                className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors sm:px-4 ${
                  activeTab === id
                    ? "bg-[var(--signal)] text-[var(--signal-ink)]"
                    : "text-[var(--text-soft)] hover:bg-[var(--panel-strong)] hover:text-[var(--text)]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className={id === "overview" ? "hidden md:inline" : "inline"}>{label}</span>
              </button>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      </header>

      <StatusBanner
        error={error}
        warning={generationWarning || storageNotice}
        notice={notice || speechNotice}
      />

      <section
        id="workspace"
        className={`relative min-h-dvh px-[max(16px,3.5vw)] pb-28 pt-[104px] ${pageTone}`}
      >
        {activeTab === "overview" ? (
          <div className="mx-auto max-w-[1540px]">
            <section className="dashboard-hero dashboard-reveal relative overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] px-6 py-16 sm:px-10 lg:px-14 lg:py-24">
              <div className="absolute -right-16 -top-24 h-80 w-80 rounded-full bg-[color-mix(in_srgb,var(--signal)_18%,transparent)] blur-[90px]" />
              <div className="relative max-w-5xl">
                <p className="mb-7 font-[var(--mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--text-soft)]">
                  Your teaching control room
                </p>
                <h1 className="max-w-5xl font-['Satoshi',var(--body)] text-[clamp(3rem,6.2vw,6.7rem)] font-semibold leading-[0.9] tracking-[-0.055em]">
                  {"Plan the lesson.".split(" ").map((word) => (
                    <span key={word} className="hero-word mr-[0.2em] inline-block">{word}</span>
                  ))}
                  <span className="hero-word mx-[0.08em] inline-block h-[0.62em] w-[1.35em] overflow-hidden rounded-full align-[0.02em]">
                    <Image src="/neuralnet.png" alt="" width={180} height={72} className="h-full w-full object-cover contrast-125" />
                  </span>
                  {"Reveal the right visual on command.".split(" ").map((word) => (
                    <span key={word} className="hero-word mr-[0.2em] inline-block">{word}</span>
                  ))}
                </h1>
                <div className="mt-10 flex flex-wrap gap-3">
                  <Button onClick={() => selectTab("prepare")} className="h-12 rounded-xl bg-[var(--signal)] px-6 text-[var(--signal-ink)] hover:bg-[var(--signal)] hover:opacity-90">
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Prepare a lesson
                  </Button>
                  <Button onClick={() => selectTab("teach")} className="h-12 rounded-xl border border-[var(--line-strong)] bg-transparent px-6 text-[var(--text)] hover:bg-[var(--panel-strong)]">
                    <Command className="mr-2 h-4 w-4" aria-hidden="true" />
                    Enter teach mode
                  </Button>
                </div>
              </div>
            </section>

            <section className="overview-chapter grid grid-flow-dense grid-cols-1 gap-4 py-24 lg:grid-cols-12 lg:py-36">
              <div className="overview-pin dashboard-reveal rounded-[1.6rem] border border-[var(--line)] bg-[var(--panel)] p-7 lg:col-span-7 lg:min-h-[420px]">
                <div className="flex items-center justify-between">
                  <span className="font-[var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--text-soft)]">Prepared library</span>
                  <span className="text-4xl font-semibold tabular-nums">{lessons.length}</span>
                </div>
                <p className="mt-20 max-w-xl text-balance text-3xl font-semibold leading-tight sm:text-5xl">
                  Build once. Call the idea back exactly when the room needs it.
                </p>
                {recallPhrases.length > 0 ? (
                  <div className="mt-12 overflow-hidden border-y border-[var(--line)] py-4">
                    <div className="dashboard-marquee-track flex w-max gap-8 whitespace-nowrap font-[var(--mono)] text-xs uppercase text-[var(--text-soft)]">
                      {[...recallPhrases, ...recallPhrases].map((phrase, index) => (
                        <span key={`${phrase}-${index}`}>imagine show me {phrase}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="dashboard-reveal flex min-h-[420px] flex-col rounded-[1.6rem] border border-[var(--line)] bg-[var(--paper)] p-7 text-[#151915] lg:col-span-5">
                <div className="flex items-center justify-between">
                  <span className="font-[var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[#151915]/55">Recent lesson</span>
                  {lessons.length > 1 ? (
                    <div className="flex gap-2">
                      <button type="button" aria-label="Previous lesson" onClick={() => setCarouselIndex((index) => (index - 1 + lessons.length) % lessons.length)} className="grid h-9 w-9 place-items-center rounded-full border border-black/20 hover:bg-black/5"><ChevronLeft className="h-4 w-4" /></button>
                      <button type="button" aria-label="Next lesson" onClick={() => setCarouselIndex((index) => (index + 1) % lessons.length)} className="grid h-9 w-9 place-items-center rounded-full border border-black/20 hover:bg-black/5"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                  ) : null}
                </div>
                {highlightedLesson ? (
                  <>
                    <div className="mt-auto pt-16">
                      <p className="text-sm text-[#151915]/55">{highlightedLesson.subject || "General lesson"}</p>
                      <h2 className="mt-3 text-balance text-4xl font-semibold leading-none">{highlightedLesson.title}</h2>
                      <p className="mt-5 text-sm leading-6 text-[#151915]/65">{getPreparedVisuals(highlightedLesson).length} prepared visuals · {highlightedLesson.status}</p>
                    </div>
                    <button type="button" onClick={() => openLesson(highlightedLesson, "teach")} className="mt-8 w-full rounded-xl bg-[#151915] px-5 py-4 text-left font-semibold text-white transition-transform active:scale-[0.98]">Teach this lesson</button>
                  </>
                ) : (
                  <div className="my-auto">
                    <h2 className="text-4xl font-semibold leading-none">Your first lesson starts here.</h2>
                    <p className="mt-5 text-sm leading-6 text-[#151915]/65">Add your lesson material and Imagine will turn it into a previewable visual pack.</p>
                  </div>
                )}
              </div>

              {[
                ["Direct recall", "Only a complete “imagine show me” command can reveal prepared media."],
                ["Local by default", "Lesson packs stay in this browser while the cloud layer is still ahead."],
                ["Live completion", "Generated language appears while the composition is still being planned."]
              ].map(([title, body]) => (
                <article key={title} className="dashboard-reveal rounded-[1.4rem] border border-[var(--line)] bg-[var(--panel)] p-6 lg:col-span-4">
                  <h3 className="text-lg font-semibold">{title}</h3>
                  <p className="mt-8 text-sm leading-6 text-[var(--text-soft)]">{body}</p>
                </article>
              ))}
            </section>
          </div>
        ) : null}

        {activeTab === "prepare" ? (
          <div className="mx-auto grid max-w-[1540px] gap-5 lg:grid-cols-12">
            <form onSubmit={handlePrepareSubmit} className="dashboard-reveal h-max rounded-[1.6rem] border border-[var(--line)] bg-[var(--panel)] p-6 lg:sticky lg:top-24 lg:col-span-4 lg:p-8">
              <p className="font-[var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--text-soft)]">Prepare before class</p>
              <h1 className="mt-5 text-balance font-['Satoshi',var(--body)] text-4xl font-semibold leading-none tracking-[-0.035em]">Turn your lesson into a visual run of show.</h1>
              <div className="mt-9 space-y-5">
                <label className="block text-sm font-semibold">Lesson title<input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} maxLength={120} placeholder="Cellular respiration" className="mt-2 h-12 w-full rounded-xl border border-[var(--line-strong)] bg-[var(--page)] px-4 text-[var(--text)] outline-none focus:border-[var(--signal)]" /></label>
                <label className="block text-sm font-semibold">Subject <span className="font-normal text-[var(--text-soft)]">optional</span><input value={lessonSubject} onChange={(event) => setLessonSubject(event.target.value)} maxLength={80} placeholder="Biology · Grade 10" className="mt-2 h-12 w-full rounded-xl border border-[var(--line-strong)] bg-[var(--page)] px-4 text-[var(--text)] outline-none focus:border-[var(--signal)]" /></label>
                <label className="block text-sm font-semibold">Lesson material<Textarea value={lessonSource} onChange={(event) => setLessonSource(event.target.value)} maxLength={3600} rows={12} placeholder="Paste the outline, transcript, or teaching notes you plan to cover…" className="mt-2 min-h-64 resize-y rounded-xl border-[var(--line-strong)] bg-[var(--page)] px-4 py-4 text-[var(--text)]" /></label>
              </div>
              <Button type="submit" disabled={isGenerating || !lessonTitle.trim() || !lessonSource.trim()} className="mt-6 h-12 w-full rounded-xl bg-[var(--signal)] text-[var(--signal-ink)] hover:bg-[var(--signal)] hover:opacity-90">
                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Generate lesson pack
              </Button>
              <p className="mt-4 text-xs leading-5 text-[var(--text-soft)]">Saved locally after each visual completes. Raster-heavy lessons can reach browser storage limits.</p>
            </form>

            <div className="min-w-0 lg:col-span-8">
              {isGenerating ? <StreamingDraft text={streamDraft} /> : result ? <CompositionView result={result} eyebrow="Prepared lesson preview" showRecallPhrases /> : <div className="dashboard-reveal grid min-h-[560px] place-items-center rounded-[1.6rem] border border-dashed border-[var(--line-strong)] bg-[var(--panel)] px-8 text-center"><div className="max-w-md"><Sparkles className="mx-auto h-8 w-8 text-[var(--signal)]" /><h2 className="mt-6 text-3xl font-semibold">Your preview will assemble here.</h2><p className="mt-4 text-sm leading-6 text-[var(--text-soft)]">Generated words arrive first. Trusted diagrams and media complete in place, ready for review before class.</p></div></div>}

              {preparedLesson ? (
                <section className="dashboard-reveal mt-8 rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-6">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div><p className="font-[var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--text-soft)]">Recall phrases</p><h2 className="mt-2 text-2xl font-semibold">Edit the language you will say aloud.</h2></div>
                    <button type="button" onClick={() => openLesson(preparedLesson, "teach")} className="rounded-xl bg-[var(--signal)] px-5 py-3 text-sm font-semibold text-[var(--signal-ink)]">Open teach mode</button>
                  </div>
                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {getPreparedVisuals(preparedLesson).map((block) => (
                      <label key={block.blockId} className="rounded-xl border border-[var(--line)] bg-[var(--page)] p-4 text-sm font-semibold">{block.title || "Prepared visual"}<input value={block.recallPhrases.join(", ")} onChange={(event) => updateRecallPhrases(preparedLesson, block.blockId, event.target.value)} placeholder="energy cycle, atp flow" className="mt-3 h-11 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-3 font-normal text-[var(--text)] outline-none focus:border-[var(--signal)]" /><span className="mt-2 block text-xs font-normal text-[var(--text-soft)]">Up to three comma-separated phrases.</span></label>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === "library" ? (
          <div className="mx-auto max-w-[1540px]">
            <div className="dashboard-reveal flex flex-wrap items-end justify-between gap-6">
              <div><p className="font-[var(--mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--canvas-muted)]">Prepared locally</p><h1 className="mt-4 max-w-4xl text-balance font-['Satoshi',var(--body)] text-[clamp(3rem,6vw,6rem)] font-semibold leading-[0.92] tracking-[-0.05em]">Preview every lesson before it enters the room.</h1></div>
              <Button onClick={() => selectTab("prepare")} className="h-12 rounded-xl bg-[var(--signal)] px-6 text-[var(--signal-ink)] hover:bg-[var(--signal)]"><Plus className="mr-2 h-4 w-4" />New lesson</Button>
            </div>
            {lessons.length > 0 ? (
              <div className="mt-16 grid grid-flow-dense gap-4 md:grid-cols-2 xl:grid-cols-3">
                {lessons.map((lesson) => (
                  <article key={lesson.id} className="dashboard-reveal group flex min-h-[330px] flex-col overflow-hidden rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-6 transition-transform duration-500 hover:-translate-y-1">
                    <div className="flex items-center justify-between"><span className="rounded-full border border-[var(--line)] px-3 py-1 font-[var(--mono)] text-[9px] uppercase tracking-[0.1em] text-[var(--text-soft)]">{lesson.status}</span><button type="button" onClick={() => deleteLesson(lesson.id)} aria-label={`Delete ${lesson.title}`} className="grid h-9 w-9 place-items-center rounded-full text-[var(--text-soft)] hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button></div>
                    <div className="mt-auto pt-16"><p className="text-sm text-[var(--text-soft)]">{lesson.subject || "General lesson"}</p><h2 className="mt-3 text-balance text-3xl font-semibold leading-none">{lesson.title}</h2><p className="mt-4 text-xs leading-5 text-[var(--text-soft)]">{getPreparedVisuals(lesson).length} visuals · Updated {new Date(lesson.updatedAt).toLocaleDateString()}</p></div>
                    <div className="mt-7 grid grid-cols-2 gap-2"><button type="button" onClick={() => openLesson(lesson, "library")} className="rounded-xl border border-[var(--line-strong)] px-4 py-3 text-sm font-semibold hover:bg-[var(--panel-strong)]">Preview</button><button type="button" onClick={() => openLesson(lesson, "teach")} className="rounded-xl bg-[var(--signal)] px-4 py-3 text-sm font-semibold text-[var(--signal-ink)]">Teach</button></div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="dashboard-reveal mt-16 grid min-h-[420px] place-items-center rounded-[1.5rem] border border-dashed border-[var(--line-strong)] text-center"><div><Library className="mx-auto h-8 w-8 text-[var(--signal)]" /><h2 className="mt-5 text-3xl font-semibold">No prepared lessons yet.</h2></div></div>
            )}
            {result && preparedLesson ? <div className="mt-20"><CompositionView result={preparedLesson.composition} eyebrow={`${preparedLesson.title} preview`} showRecallPhrases /></div> : null}
          </div>
        ) : null}

        {activeTab === "teach" ? (
          <div className="mx-auto max-w-[1540px]">
            <div className="dashboard-reveal mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[1.3rem] border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
              <div><p className="font-[var(--mono)] text-[9px] uppercase tracking-[0.12em] text-[var(--text-soft)]">Armed lesson</p><p className="mt-1 font-semibold">{selectedLesson?.title ?? "Choose a prepared lesson"}</p></div>
              <select value={selectedLessonId} onChange={(event) => { setSelectedLessonId(event.target.value); setPresentedBlock(null); }} className="h-11 min-w-64 rounded-xl border border-[var(--line-strong)] bg-[var(--page)] px-4 text-sm text-[var(--text)] outline-none focus:border-[var(--signal)]">
                <option value="">Select lesson</option>
                {lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
              </select>
            </div>

            {presentedBlock && selectedLesson ? (
              <div className="dashboard-reveal"><CompositionCard block={presentedBlock} theme={selectedLesson.composition.theme} presentation showRecallPhrases /></div>
            ) : (
              <section className="dashboard-reveal grid min-h-[60dvh] place-items-center rounded-[1.8rem] border border-[var(--line)] bg-[var(--panel)] px-6 text-center">
                <div className="max-w-3xl"><Command className="mx-auto h-10 w-10 text-[var(--signal)]" /><h1 className="mt-8 text-balance font-['Satoshi',var(--body)] text-[clamp(2.6rem,6vw,5.8rem)] font-semibold leading-[0.94] tracking-[-0.05em]">Say the exact phrase. Nothing new gets generated.</h1><p className="mx-auto mt-7 max-w-xl text-base leading-7 text-[var(--text-soft)]">Try “imagine show me {selectedLesson ? getPreparedVisuals(selectedLesson)[0]?.recallPhrases[0] ?? "the prepared visual" : "the prepared visual"}”.</p></div>
              </section>
            )}

            {selectedLesson ? (
              <div className="mt-8 flex flex-wrap gap-2">
                {getPreparedVisuals(selectedLesson).flatMap((block) => block.recallPhrases).map((phrase) => (
                  <button key={phrase} type="button" onClick={() => setCapturedInput(`imagine show me ${phrase}`)} className="rounded-full border border-[var(--line-strong)] px-4 py-2 font-[var(--mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--canvas-muted)] hover:border-[var(--signal)] hover:text-[var(--canvas-text)]">imagine show me {phrase}</button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "live" ? (
          <div className="mx-auto grid min-h-[calc(100dvh-250px)] max-w-[1540px] items-center">
            {isGenerating ? <StreamingDraft text={streamDraft} /> : result ? <CompositionView result={result} eyebrow="Live canvas" /> : <EmptyCanvas onPrepare={() => selectTab("prepare")} />}
          </div>
        ) : null}
      </section>

      {showCommandDock ? (
        <form onSubmit={activeTab === "teach" ? handleTeachSubmit : handleLiveSubmit} className="fixed bottom-4 left-4 right-4 z-[35] mx-auto flex w-[min(900px,calc(100%-32px))] items-end gap-2 rounded-2xl border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--panel)_94%,transparent)] p-2 shadow-[0_24px_70px_var(--shadow)] backdrop-blur-[20px]">
          <label htmlFor="workspace-input" className="sr-only">{activeTab === "teach" ? "Prepared visual command" : "Teaching input"}</label>
          <Textarea id="workspace-input" value={displayValue} onChange={(event) => { setCapturedInput(event.target.value); setLiveTranscript(""); }} onKeyDown={handleInputKeyDown} placeholder={activeTab === "teach" ? "imagine show me energy cycle" : "Explain a concept, system, or process…"} maxLength={4000} rows={1} className="min-h-14 flex-1 resize-none rounded-xl border-0 bg-transparent px-5 py-[1.05rem] text-base leading-6 text-[var(--text)] shadow-none placeholder:text-[var(--text-soft)]" />
          <Button type="submit" disabled={!displayValue.trim() || isGenerating} className="h-14 w-14 shrink-0 rounded-xl bg-[var(--signal)] px-0 text-[var(--signal-ink)] hover:bg-[var(--signal)] hover:opacity-90" aria-label={activeTab === "teach" ? "Run prepared command" : "Generate canvas"}>{isGenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}</Button>
          <Button type="button" onClick={() => void startTranscription()} className={`h-14 w-14 shrink-0 rounded-xl px-0 ${speechStatus === "idle" ? "bg-[var(--canvas-text)] text-[var(--canvas-bg)]" : "bg-red-600 text-white"}`} aria-label={speechStatus === "idle" ? "Start microphone" : "Stop microphone"}>{speechStatus === "connecting" ? <Loader2 className="h-5 w-5 animate-spin" /> : speechStatus === "listening" ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</Button>
        </form>
      ) : null}
    </main>
  );
}
