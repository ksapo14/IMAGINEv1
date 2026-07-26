"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowUp,
  Loader2,
  Mic,
  MicOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  StructuredDiagram,
  type StructuredDiagramData
} from "@/components/diagrams/structured-diagram";

type SpeechStatus = "idle" | "connecting" | "listening";
type LayoutMode =
  | "textDominant"
  | "visualDominant"
  | "balanced"
  | "sequence"
  | "comparison";
type ThemePalette = "slate" | "sage" | "ember" | "indigo" | "mono";
type ThemeDensity = "compact" | "comfortable" | "spacious";
type ThemeMotion = "subtle" | "none";
type BlockKind =
  | "heading"
  | "notes"
  | "callout"
  | "diagram"
  | "image"
  | "comparison"
  | "timeline";
type BlockSize = "compact" | "medium" | "large" | "wide";

type DeepgramMessage = {
  type?: string;
  status?: string;
  message?: string;
  description?: string;
  code?: string;
  event?: string;
  transcript?: string;
  speech_final?: boolean;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
    }>;
  };
};

type DeepgramStatusResponse = {
  configured: boolean;
  apiKeyStatus:
    | "not_checked"
    | "missing"
    | "valid"
    | "invalid"
    | "unreachable"
    | "error";
  apiKeyMessage: string;
};

type GeneratedVisual =
  | {
      kind: "diagram";
      alt: string;
      diagram: StructuredDiagramData;
    }
  | {
      kind: "generated";
      dataUrl: string;
      mimeType: string;
      alt: string;
    };

type CompositionTheme = {
  palette: ThemePalette;
  density: ThemeDensity;
  motion: ThemeMotion;
};

type CompositionBlock = {
  blockId: string;
  kind: BlockKind;
  title: string;
  body: string;
  items: string[];
  size: BlockSize;
  visual: GeneratedVisual | null;
  visualJobId: string | null;
  visualFailed?: boolean;
};

type GenerateResponse = {
  title: string;
  layoutMode: LayoutMode;
  theme: CompositionTheme;
  blocks: CompositionBlock[];
  warning: string | null;
};

type VisualJobResponse = {
  status: "pending" | "complete" | "failed";
  blockId: string;
  visual: GeneratedVisual | null;
  warning: string | null;
};

const paletteClasses: Record<ThemePalette, string> = {
  slate: "bg-[var(--canvas-bg)] text-[var(--canvas-text)] transition-colors duration-300",
  sage: "bg-[var(--canvas-bg)] text-[var(--canvas-text)] transition-colors duration-300",
  ember: "bg-[var(--canvas-bg)] text-[var(--canvas-text)] transition-colors duration-300",
  indigo: "bg-[var(--canvas-bg)] text-[var(--canvas-text)] transition-colors duration-300",
  mono: "bg-[var(--canvas-bg)] text-[var(--canvas-text)] transition-colors duration-300"
};

const accentClasses: Record<ThemePalette, string> = {
  slate: "border-[var(--canvas-slate-border)] bg-[var(--canvas-slate-bg)] text-[var(--canvas-text)] shadow-[0_20px_60px_var(--shadow)]",
  sage: "border-[var(--canvas-sage-border)] bg-[var(--canvas-sage-bg)] text-[var(--canvas-text)] shadow-[0_20px_60px_var(--shadow)]",
  ember: "border-[var(--canvas-ember-border)] bg-[var(--canvas-ember-bg)] text-[var(--canvas-text)] shadow-[0_20px_60px_var(--shadow)]",
  indigo: "border-[var(--canvas-indigo-border)] bg-[var(--canvas-indigo-bg)] text-[var(--canvas-text)] shadow-[0_20px_60px_var(--shadow)]",
  mono: "border-[var(--canvas-mono-border)] bg-[var(--canvas-mono-bg)] text-[var(--canvas-text)] shadow-[0_20px_60px_var(--shadow)]"
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

function getApiBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  const apiPort = process.env.NEXT_PUBLIC_API_PORT?.trim() || "8010";
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${apiPort}`;
  }

  return `http://127.0.0.1:${apiPort}`;
}

const API_BASE_URL = getApiBaseUrl();

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
    cache: "no-store"
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

function getCanvasClass(layoutMode: LayoutMode, density: ThemeDensity) {
  const densityClass =
    density === "compact"
      ? "gap-4"
      : density === "spacious"
        ? "gap-8"
        : "gap-6";
  const base = `mx-auto grid w-full max-w-[1600px] grid-cols-1 ${densityClass} lg:grid-cols-12`;

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
  motion
}: {
  block: CompositionBlock;
  motion: ThemeMotion;
}) {
  const heightClass =
    block.kind === "diagram" || block.visual?.kind === "diagram"
      ? "h-[min(82dvh,860px)] min-h-[620px]"
      : block.size === "wide"
        ? "h-[min(74dvh,760px)] min-h-[460px]"
      : block.size === "large"
        ? "h-[min(70dvh,660px)] min-h-[420px]"
        : "h-[min(58dvh,520px)] min-h-[320px]";

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
            The rest of the canvas is ready. Try the prompt again to rebuild
            this visual.
          </p>
        </div>
      </div>
    );
  }

  if (block.visual?.kind === "diagram") {
    return (
      <div className={`${heightClass} overflow-hidden bg-[#f4f2ec]`}>
        <StructuredDiagram
          diagram={block.visual.diagram}
          alt={block.visual.alt}
          motion={motion}
        />
      </div>
    );
  }

  if (block.visual?.kind === "generated") {
    return (
      <div className={`grid ${heightClass} place-items-center bg-[var(--canvas-surface)]`}>
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
      className={`${heightClass} relative overflow-hidden bg-[var(--canvas-surface)]`}
    >
      <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.62),transparent)]" />
      <div className="grid h-full place-items-center text-sm font-medium text-[var(--canvas-muted)]">
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Building visual
        </span>
      </div>
    </div>
  );
}

function CompositionCard({
  block,
  theme
}: {
  block: CompositionBlock;
  theme: CompositionTheme;
}) {
  const hasVisual =
    block.kind === "diagram" ||
    block.kind === "image" ||
    block.visual ||
    block.visualJobId;
  const cardTone = accentClasses[theme.palette];
  const clippingClass =
    block.kind === "diagram" || block.visual?.kind === "diagram"
      ? "overflow-visible"
      : "overflow-hidden";

  return (
    <article
      className={`${getBlockSpanClass(block)} ${clippingClass} rounded-[1.35rem] border ${cardTone} shadow-[0_20px_60px_rgba(47,57,52,0.08)]`}
    >
      {hasVisual ? <VisualPanel block={block} motion={theme.motion} /> : null}

      <div
        className={
          hasVisual
            ? "space-y-4 px-5 py-4 sm:px-6"
            : "space-y-5 px-6 py-6 sm:px-7 sm:py-7"
        }
      >
        {block.title ? (
          <h2 className="text-balance text-xl font-semibold leading-tight text-[var(--canvas-text)] sm:text-2xl">
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
              <li key={`${block.blockId}-${item}`} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-[var(--canvas-soft)] text-xs font-semibold tabular-nums text-[var(--canvas-text)]">
                  {index + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        ) : block.items.length > 0 && block.kind === "comparison" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {block.items.map((item) => (
              <div
                key={`${block.blockId}-${item}`}
                className="rounded-2xl bg-[var(--canvas-soft)] px-4 py-3 text-sm leading-6 text-[var(--canvas-text)]"
              >
                {item}
              </div>
            ))}
          </div>
        ) : block.items.length > 0 ? (
          <ul className="space-y-3 text-base leading-7 text-[var(--canvas-muted)]">
            {block.items.map((item) => (
              <li key={`${block.blockId}-${item}`} className="flex gap-3">
                <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--canvas-muted)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <section className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr_0.85fr] lg:items-center">
      <div>
        <p className="mb-4 text-sm font-semibold text-[var(--canvas-muted)]">
          live teaching canvas
        </p>
        <h1 className="text-balance text-4xl font-semibold leading-[1.02] text-[var(--canvas-text)] sm:text-6xl">
          Start speaking to generate structured notes.
        </h1>
      </div>
      <div className="grid gap-3 rounded-[1.4rem] bg-[var(--canvas-surface)] p-4">
        <div className="h-24 rounded-2xl bg-[var(--canvas-soft)]" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-28 rounded-2xl bg-[var(--canvas-soft)] opacity-70" />
          <div className="h-28 rounded-2xl bg-[var(--canvas-soft)] opacity-70" />
        </div>
        <div className="h-16 rounded-2xl bg-[var(--canvas-soft)]" />
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <section
      role="status"
      className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-12"
    >
      <div className="rounded-[1.35rem] bg-[var(--canvas-surface)] p-7 lg:col-span-5">
        <div className="mb-5 h-5 w-28 animate-pulse rounded bg-[var(--canvas-soft)]" />
        <div className="mb-3 h-10 w-4/5 animate-pulse rounded bg-[var(--canvas-soft)]" />
        <div className="h-10 w-3/5 animate-pulse rounded bg-[var(--canvas-soft)]" />
      </div>
      <div className="h-[420px] rounded-[1.35rem] bg-[var(--canvas-surface)] lg:col-span-7">
        <div className="grid h-full place-items-center text-sm font-medium text-[var(--canvas-muted)]">
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Planning canvas
          </span>
        </div>
      </div>
    </section>
  );
}

function ResultCanvas({ result }: { result: GenerateResponse }) {
  return (
    <section aria-live="polite" className="w-full">
      <div className="mx-auto mb-7 max-w-7xl">
        <p className="mb-3 text-sm font-semibold text-[var(--canvas-muted)]">
          {result.layoutMode.replace(/([A-Z])/g, " $1").toLowerCase()}
        </p>
        <h1 className="max-w-4xl text-balance text-4xl font-semibold leading-[1.04] text-[var(--canvas-text)] sm:text-6xl">
          {result.title}
        </h1>
      </div>
      <div className={getCanvasClass(result.layoutMode, result.theme.density)}>
        {result.blocks.map((block) => (
          <CompositionCard
            key={block.blockId}
            block={block}
            theme={result.theme}
          />
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [capturedInput, setCapturedInput] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [error, setError] = useState("");
  const [speechNotice, setSpeechNotice] = useState("");
  const [generationWarning, setGenerationWarning] = useState("");
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>("idle");
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const microphoneStream = useRef<MediaStream | null>(null);
  const transcriptionSocket = useRef<WebSocket | null>(null);
  const speechStopRequested = useRef(false);
  const deepgramConnected = useRef(false);
  const generationInFlight = useRef(false);
  const activeVisualJobs = useRef<Set<string>>(new Set());
  const visualJobControllers = useRef<Map<string, AbortController>>(new Map());

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
      } else if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING ||
        socket.readyState === WebSocket.CLOSING
      ) {
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
    setSpeechNotice("Checking microphone transcription...");
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

      setSpeechNotice("Requesting microphone access...");
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
        if (
          !deepgramConnected.current &&
          socket.readyState !== WebSocket.CLOSED &&
          !speechStopRequested.current
        ) {
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

      socket.onopen = () => {
        setSpeechNotice("Connecting transcription...");
      };

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
            setSpeechNotice("Connecting transcription...");
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

        const transcript =
          data.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
        if (data.type === "Results" && transcript) {
          setLiveTranscript(transcript);
          if (data.speech_final) {
            appendTranscript(transcript);
          }
        }
      };

      socket.onerror = () => {
        if (!speechStopRequested.current) {
          window.clearTimeout(connectionTimeout);
          failTranscription("Transcription websocket connection failed.");
        }
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
  }, [
    appendTranscript,
    failTranscription,
    speechStatus,
    stopTranscription
  ]);

  useEffect(() => {
    return () => stopTranscription();
  }, [stopTranscription]);

  useEffect(() => {
    const controllers = visualJobControllers.current;
    const jobs = activeVisualJobs.current;

    return () => {
      jobs.clear();
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
    };
  }, []);

  const displayValue = liveTranscript
    ? capturedInput.trim().length > 0
      ? `${capturedInput.trimEnd()} ${liveTranscript}`
      : liveTranscript
    : capturedInput;

  const patchVisualBlock = useCallback((job: VisualJobResponse) => {
    setResult((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        blocks: current.blocks.map((block) =>
          block.blockId === job.blockId
            ? {
                ...block,
                visual: job.visual,
                visualJobId: null,
                visualFailed: job.status === "failed"
              }
            : block
        ),
        warning: job.warning
      };
    });
  }, []);

  const markVisualJobFailed = useCallback((jobId: string) => {
    setResult((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        blocks: current.blocks.map((block) =>
          block.visualJobId === jobId
            ? {
                ...block,
                visualJobId: null,
                visualFailed: true
              }
            : block
        )
      };
    });
  }, []);

  const pollVisualJob = useCallback(
    async (jobId: string) => {
      activeVisualJobs.current.add(jobId);
      const controller = new AbortController();
      visualJobControllers.current.set(jobId, controller);

      try {
        for (let attempt = 0; attempt < 60; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
          if (!activeVisualJobs.current.has(jobId)) {
            return;
          }

          const job = await fetchVisualJob(jobId, controller.signal);
          if (!activeVisualJobs.current.has(jobId)) {
            return;
          }
          if (job.status === "pending") {
            continue;
          }

          activeVisualJobs.current.delete(jobId);
          if (job.status === "complete" && job.visual) {
            patchVisualBlock(job);
            setGenerationWarning(job.warning ?? "");
            return;
          }

          patchVisualBlock(job);
          setGenerationWarning(
            job.warning ?? "The visual could not be generated."
          );
          return;
        }

        if (activeVisualJobs.current.has(jobId)) {
          activeVisualJobs.current.delete(jobId);
          markVisualJobFailed(jobId);
          setGenerationWarning("A visual could not be completed in time.");
        }
      } catch (visualError) {
        if (controller.signal.aborted) {
          return;
        }
        if (activeVisualJobs.current.has(jobId)) {
          activeVisualJobs.current.delete(jobId);
          markVisualJobFailed(jobId);
          setGenerationWarning(
            visualError instanceof Error
              ? visualError.message
              : "The visual request could not be completed."
          );
        }
      } finally {
        visualJobControllers.current.delete(jobId);
      }
    },
    [markVisualJobFailed, patchVisualBlock]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedInput = displayValue.trim();
    if (!submittedInput || generationInFlight.current) {
      return;
    }

    generationInFlight.current = true;
    setCapturedInput("");
    setLiveTranscript("");
    setError("");
    setGenerationWarning("");
    setResult(null);
    setIsGenerating(true);
    activeVisualJobs.current.clear();

    try {
      const response = await fetch(`${API_BASE_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userInput: submittedInput })
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(
          problem?.detail ?? "The generation request could not be completed."
        );
      }

      const generated = (await response.json()) as GenerateResponse;
      setResult(generated);
      setGenerationWarning(generated.warning ?? "");
      generated.blocks.forEach((block) => {
        if (block.visualJobId) {
          void pollVisualJob(block.visualJobId);
        }
      });
    } catch (requestError) {
      setCapturedInput((current) =>
        current.trim().length > 0 ? current : submittedInput
      );
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The generation request could not be completed."
      );
    } finally {
      generationInFlight.current = false;
      setIsGenerating(false);
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  const pageTone = result?.theme.palette
    ? paletteClasses[result.theme.palette]
    : "bg-[var(--canvas-bg)] text-[var(--canvas-text)] transition-colors duration-300";

  return (
    <main className="min-h-dvh bg-[var(--page)] text-[var(--text)]">
      <a href="#workspace" className="fixed left-3 top-3 z-[100] -translate-y-[calc(100%+28px)] rounded bg-[var(--signal)] px-[15px] py-[11px] font-[750] text-[var(--signal-ink)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:translate-y-0">
        Skip to workspace
      </a>
      <header className="fixed inset-x-0 top-0 z-40 grid h-[68px] grid-cols-[1fr_auto_1fr] items-center border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--page)_85%,transparent)] py-0 pl-6 pr-[18px] backdrop-blur-[20px] max-[767px]:grid-cols-[1fr_auto] max-[767px]:px-3 max-[767px]:pl-4 [&>p]:m-0 [&>p]:font-[var(--mono)] [&>p]:text-[11px] [&>p]:uppercase [&>p]:text-[var(--text-soft)] max-[767px]:[&>p]:hidden [&_.theme-toggle]:justify-self-end">
        <Link href="/" className="inline-flex w-max items-center gap-[10px] font-[820]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span className="relative h-[30px] w-[30px] flex-none" aria-hidden="true">
            <Image
              src="/brand/imagineer-shortform.png"
              alt=""
              width={30}
              height={30}
              className="brand-logo-dark absolute inset-0 h-[30px] w-[30px] rounded-[7px] shadow-[0_0_0_1px_color-mix(in_srgb,var(--signal)_22%,transparent)] max-[767px]:h-7 max-[767px]:w-7 max-[767px]:rounded-md"
            />
            <Image
              src="/brand/imagineer-shortform-light.png"
              alt=""
              width={30}
              height={30}
              className="brand-logo-light absolute inset-0 hidden h-[30px] w-[30px] rounded-[7px] shadow-[0_0_0_1px_color-mix(in_srgb,var(--signal)_22%,transparent)] max-[767px]:h-7 max-[767px]:w-7 max-[767px]:rounded-md"
            />
          </span>
          <span>IMAGINE V1</span>
        </Link>
        <p>Live learning canvas</p>
        <ThemeToggle />
      </header>

      <section id="workspace" className={`relative min-h-dvh px-[max(18px,4vw)] pb-[150px] pt-28 max-[767px]:px-[14px] max-[767px]:pb-[184px] max-[767px]:pt-[108px] ${pageTone}`}>
        <div className="absolute left-[max(18px,4vw)] right-[max(18px,4vw)] top-[86px] flex justify-between font-[var(--mono)] text-[10px] uppercase text-[var(--canvas-muted)] max-[767px]:left-[14px] max-[767px]:right-[14px]">
          <span>Explain anything</span>
          <span>Voice or text</span>
        </div>

        {error ? (
          <div role="alert" className="fixed left-1/2 top-[84px] z-50 w-[min(calc(100%-32px),480px)] -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-[18px] py-3 text-center text-sm text-red-700">{error}</div>
        ) : generationWarning ? (
          <div role="status" className="fixed left-1/2 top-[84px] z-50 w-[min(calc(100%-32px),480px)] -translate-x-1/2 rounded-lg border border-amber-200 bg-amber-50 px-[18px] py-3 text-center text-sm text-amber-800">{generationWarning}</div>
        ) : speechNotice ? (
          <div role="status" className="fixed left-1/2 top-[84px] z-50 w-[min(calc(100%-32px),480px)] -translate-x-1/2 rounded-lg border border-[#d8d8d0] bg-white px-[18px] py-3 text-center text-sm text-[#646a64]">{speechNotice}</div>
        ) : null}

        <div className="grid min-h-[calc(100dvh-260px)] items-center">
          {isGenerating ? (
            <LoadingState />
          ) : result ? (
            <ResultCanvas result={result} />
          ) : (
            <EmptyState />
          )}
        </div>

        <form onSubmit={handleSubmit} className="fixed bottom-[18px] left-[18px] right-[18px] z-[35] mx-auto flex w-[min(820px,calc(100%-36px))] items-end gap-2 rounded-xl border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--panel)_92%,transparent)] p-[7px] shadow-[0_24px_70px_var(--shadow)] backdrop-blur-[20px] max-[767px]:bottom-[10px] max-[767px]:left-[10px] max-[767px]:right-[10px] max-[767px]:w-[calc(100%-20px)] max-[767px]:flex-wrap max-[767px]:[&_textarea]:basis-full">
          <label htmlFor="speech-input" className="sr-only">Speech input</label>
          <Textarea
            id="speech-input"
            value={displayValue}
            onChange={(event) => {
              setCapturedInput(event.target.value);
              setLiveTranscript("");
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Explain a concept, system, or process..."
            rows={1}
            className="min-h-14 flex-1 resize-none rounded-lg border-0 bg-transparent px-5 py-[1.05rem] text-base leading-6 text-[var(--text)] shadow-none placeholder:text-[var(--text-soft)] max-[767px]:w-full"
          />
          <Button
            type="submit"
            disabled={!displayValue.trim() || isGenerating}
            className="h-14 w-14 shrink-0 rounded-lg bg-[var(--signal)] px-0 text-[var(--signal-ink)] hover:bg-[var(--signal)] hover:opacity-[0.88] active:scale-[0.97] max-[767px]:w-[calc(50%-4px)]"
            aria-label="Submit input"
          >
            {isGenerating ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ArrowUp className="h-5 w-5" aria-hidden="true" />}
          </Button>
          <Button
            type="button"
            onClick={() => void startTranscription()}
            className={`h-14 w-14 shrink-0 rounded-lg px-0 active:scale-[0.97] max-[767px]:w-[calc(50%-4px)] ${speechStatus === "idle" ? "bg-[var(--canvas-text)] text-[var(--canvas-bg)]" : "bg-red-600 text-white"}`}
            aria-label={speechStatus === "idle" ? "Start microphone" : "Stop microphone"}
          >
            {speechStatus === "connecting" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : speechStatus === "listening" ? <MicOff className="h-5 w-5" aria-hidden="true" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
          </Button>
        </form>
      </section>
    </main>
  );
}
