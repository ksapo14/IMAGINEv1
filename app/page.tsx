"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { ArrowUp, Loader2, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
      html: string;
      alt: string;
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
  slate: "bg-[#f7f8f6] text-[#1f2528]",
  sage: "bg-[#f3f6f1] text-[#1f2822]",
  ember: "bg-[#f8f4ef] text-[#2b231f]",
  indigo: "bg-[#f5f5fa] text-[#202234]",
  mono: "bg-[#f7f7f4] text-[#232321]"
};

const accentClasses: Record<ThemePalette, string> = {
  slate: "border-[#8d9aa3] bg-[#edf1f2]",
  sage: "border-[#8aa08c] bg-[#edf4ec]",
  ember: "border-[#b58d73] bg-[#f5ebe2]",
  indigo: "border-[#9490b8] bg-[#eeeeF8]",
  mono: "border-[#a5a49c] bg-[#efeee8]"
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

async function fetchVisualJob(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/api/visual/${jobId}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("The visual request could not be completed.");
  }

  return (await response.json()) as VisualJobResponse;
}

function getDiagramDocument(html: string, motion: ThemeMotion) {
  const motionCss =
    motion === "subtle"
      ? `
  .reveal, .node, .lane, .card, .callout, .step, .phase {
    animation: rise-in 560ms ease both;
  }
  .node:nth-child(2), .step:nth-child(2), .card:nth-child(2) { animation-delay: 70ms; }
  .node:nth-child(3), .step:nth-child(3), .card:nth-child(3) { animation-delay: 140ms; }
  .node:nth-child(4), .step:nth-child(4), .card:nth-child(4) { animation-delay: 210ms; }
  .pulse, .emphasis {
    animation: pulse-node 2.8s ease-in-out infinite;
  }
  .arrow, .connector {
    animation: flow-cue 1.9s ease-in-out infinite;
  }
  .draw, svg path, svg line, svg polyline {
    stroke-dasharray: 120;
    stroke-dashoffset: 120;
    animation: draw-line 1.3s ease forwards;
  }
  @keyframes rise-in {
    from { opacity: 0; transform: translateY(10px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes pulse-node {
    0%, 100% { transform: translateY(0); box-shadow: 0 10px 28px rgba(49, 63, 72, 0.08); }
    50% { transform: translateY(-2px); box-shadow: 0 16px 36px rgba(49, 63, 72, 0.14); }
  }
  @keyframes flow-cue {
    0%, 100% { opacity: 0.58; transform: translateX(0); }
    50% { opacity: 1; transform: translateX(3px); }
  }
  @keyframes draw-line {
    to { stroke-dashoffset: 0; }
  }`
      : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: stretch;
    overflow: auto;
    background:
      radial-gradient(circle at 12% 8%, rgba(138, 160, 140, 0.16), transparent 30%),
      radial-gradient(circle at 86% 86%, rgba(181, 141, 115, 0.14), transparent 34%),
      #f4f2ec;
    color: #202124;
    font-family: Aptos, "Segoe UI", ui-sans-serif, system-ui, sans-serif;
  }
  .diagram {
    width: 100%;
    min-height: 100vh;
    padding: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 22px;
  }
  .hero-diagram, .workflow, .wide, .large {
    width: 100%;
    min-height: 100vh;
  }
  .flow, .row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 18px;
    width: 100%;
  }
  .node, .lane {
    border: 1px solid rgba(75, 87, 96, 0.22);
    background: rgba(255, 255, 255, 0.86);
    border-radius: 16px;
    padding: 16px 18px;
    min-width: 140px;
    max-width: 320px;
    text-align: center;
    font-size: 15px;
    line-height: 1.35;
    font-weight: 650;
    box-shadow: 0 12px 32px rgba(49, 63, 72, 0.09);
  }
  .card, .callout {
    border: 1px solid rgba(75, 87, 96, 0.18);
    background: rgba(255, 255, 255, 0.78);
    border-radius: 18px;
    padding: 16px;
    box-shadow: 0 14px 34px rgba(49, 63, 72, 0.08);
  }
  .node-primary { border-color: #6f8d75; background: #edf4ec; }
  .node-secondary { border-color: #8794a0; background: #edf1f2; }
  .node-accent { border-color: #b58d73; background: #f5ebe2; }
  .node-muted { color: #636963; background: #f7f7f1; }
  .input { border-color: #8794a0; background: #edf1f2; }
  .output { border-color: #6f8d75; background: #edf4ec; }
  .cause { border-color: #9490b8; background: #eeeeF8; }
  .effect { border-color: #b58d73; background: #f5ebe2; }
  .warning { border-color: #b58d73; background: #fff8e8; }
  .evidence { border-color: #69757b; background: #f7f8f6; }
  .phase, .step {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .workflow .step, .workflow .node {
    min-height: 120px;
    justify-content: center;
  }
  .start {
    border-color: #6f8d75;
    background: #edf4ec;
    border-radius: 999px;
  }
  .end {
    border-color: #2f4f3a;
    background: #dfeadf;
    border-radius: 999px;
  }
  .decision {
    border-color: #b58d73;
    background: #f5ebe2;
  }
  .checkpoint {
    border-style: dashed;
  }
  .retry {
    border-color: #b58d73;
    background: #fff8e8;
  }
  .lane-title {
    align-self: stretch;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    background: rgba(49, 63, 72, 0.1);
    padding: 8px 10px;
    color: #39454c;
    font-size: 12px;
    font-weight: 800;
  }
  .step-number, .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 28px;
    border-radius: 10px;
    padding: 4px 10px;
    background: rgba(49, 63, 72, 0.1);
    color: #39454c;
    font-size: 12px;
    font-weight: 750;
    align-self: center;
  }
  .title, h3 {
    margin: 0;
    font-size: 17px;
    line-height: 1.2;
    font-weight: 750;
  }
  .label, strong {
    font-weight: 750;
  }
  .detail, .note, p {
    margin: 0;
    color: #5e666a;
    font-size: 13px;
    line-height: 1.4;
    font-weight: 500;
  }
  .branch, .split, .merge, .loop, .retry, .tier, .timeline, .timeline-track, .cycle, .swimlane {
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: 14px;
    flex-wrap: wrap;
    width: 100%;
  }
  .cycle {
    border-radius: 999px;
    padding: 28px;
    border: 1px dashed rgba(75, 87, 96, 0.28);
  }
  .swimlane {
    align-items: stretch;
  }
  .matrix {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 14px;
    width: 100%;
  }
  .axis {
    border-left: 2px solid #9ba6ac;
    border-bottom: 2px solid #9ba6ac;
    padding: 14px;
  }
  .arrow, .connector {
    color: #68757c;
    font-weight: 800;
    font-size: 24px;
    align-self: center;
  }
  .edge-label, .yes, .no {
    align-self: center;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.72);
    border: 1px solid rgba(75, 87, 96, 0.16);
    padding: 5px 9px;
    color: #4d5751;
    font-size: 11px;
    font-weight: 800;
  }
  .yes {
    color: #315f3c;
    background: #edf4ec;
  }
  .no {
    color: #884d32;
    background: #f5ebe2;
  }
  .caption {
    color: #5e666a;
    font-size: 13px;
    line-height: 1.4;
  }
  .compact { padding: 10px 12px; min-width: 92px; }
  svg { max-width: 100%; height: auto; }
  svg path, svg line, svg polyline {
    stroke: #68757c;
  }
  ${motionCss}
  @media (max-width: 640px) {
    body { overflow: auto; }
    .diagram { min-height: 100vh; padding: 20px; }
    .hero-diagram, .workflow, .wide, .large { min-height: 100vh; }
    .node, .lane { max-width: 100%; }
  }
</style>
</head>
<body>${html}</body>
</html>`;
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

  if (block.visual?.kind === "diagram") {
    return (
      <div className={`${heightClass} overflow-auto bg-[#f4f2ec]`}>
        <iframe
          title={block.visual.alt}
          sandbox=""
          srcDoc={getDiagramDocument(block.visual.html, motion)}
          className="h-full min-h-[900px] w-full min-w-[1280px] border-0"
        />
      </div>
    );
  }

  if (block.visual?.kind === "generated") {
    return (
      <div className={`grid ${heightClass} place-items-center bg-[#f1f0ea]`}>
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
      className={`${heightClass} relative overflow-hidden bg-[#efeee8]`}
    >
      <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.62),transparent)]" />
      <div className="grid h-full place-items-center text-sm font-medium text-[#6a6f68]">
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
          <h2 className="text-balance text-xl font-semibold leading-tight text-[#202521] sm:text-2xl">
            {block.title}
          </h2>
        ) : null}
        {block.body ? (
          <p className="max-w-[65ch] text-pretty text-base leading-7 text-[#525a55]">
            {block.body}
          </p>
        ) : null}

        {block.items.length > 0 && block.kind === "timeline" ? (
          <ol className="space-y-3 text-sm leading-6 text-[#4f5752]">
            {block.items.map((item, index) => (
              <li key={`${block.blockId}-${item}`} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-white/72 text-xs font-semibold tabular-nums text-[#313a34]">
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
                className="rounded-2xl bg-white/60 px-4 py-3 text-sm leading-6 text-[#4f5752]"
              >
                {item}
              </div>
            ))}
          </div>
        ) : block.items.length > 0 ? (
          <ul className="space-y-3 text-base leading-7 text-[#4f5752]">
            {block.items.map((item) => (
              <li key={`${block.blockId}-${item}`} className="flex gap-3">
                <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6f7d73]" />
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
        <p className="mb-4 text-sm font-semibold text-[#68716a]">
          live teaching canvas
        </p>
        <h1 className="text-balance text-4xl font-semibold leading-[1.02] text-[#202521] sm:text-6xl">
          Start speaking to generate structured notes.
        </h1>
      </div>
      <div className="grid gap-3 rounded-[1.4rem] bg-[#efeee8] p-4">
        <div className="h-24 rounded-2xl bg-white/72" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-28 rounded-2xl bg-white/58" />
          <div className="h-28 rounded-2xl bg-white/58" />
        </div>
        <div className="h-16 rounded-2xl bg-white/72" />
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
      <div className="rounded-[1.35rem] bg-[#efeee8] p-7 lg:col-span-5">
        <div className="mb-5 h-5 w-28 animate-pulse rounded bg-white/70" />
        <div className="mb-3 h-10 w-4/5 animate-pulse rounded bg-white/80" />
        <div className="h-10 w-3/5 animate-pulse rounded bg-white/70" />
      </div>
      <div className="h-[420px] rounded-[1.35rem] bg-[#efeee8] lg:col-span-7">
        <div className="grid h-full place-items-center text-sm font-medium text-[#6a6f68]">
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
        <p className="mb-3 text-sm font-semibold text-[#68716a]">
          {result.layoutMode.replace(/([A-Z])/g, " $1").toLowerCase()}
        </p>
        <h1 className="max-w-4xl text-balance text-4xl font-semibold leading-[1.04] text-[#202521] sm:text-6xl">
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
                visualJobId: null
              }
            : block
        ),
        warning: job.warning
      };
    });
  }, []);

  const pollVisualJob = useCallback(
    async (jobId: string) => {
      activeVisualJobs.current.add(jobId);

      try {
        for (let attempt = 0; attempt < 60; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
          if (!activeVisualJobs.current.has(jobId)) {
            return;
          }

          const job = await fetchVisualJob(jobId);
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
          setGenerationWarning("A visual is still generating.");
        }
      } catch (visualError) {
        if (activeVisualJobs.current.has(jobId)) {
          activeVisualJobs.current.delete(jobId);
          setGenerationWarning(
            visualError instanceof Error
              ? visualError.message
              : "The visual request could not be completed."
          );
        }
      }
    },
    [patchVisualBlock]
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
    : "bg-[#f7f8f6] text-[#1f2528]";

  return (
    <main
      className={`relative flex min-h-[100dvh] items-center justify-center px-5 pb-36 pt-10 sm:px-8 sm:pt-12 ${pageTone}`}
    >
      <div className="pointer-events-none fixed inset-0 opacity-[0.32] [background-image:radial-gradient(circle_at_18%_14%,rgba(111,141,117,0.22),transparent_28%),radial-gradient(circle_at_82%_76%,rgba(181,141,115,0.18),transparent_32%)]" />
      <div className="relative z-10 w-full">
        {isGenerating ? (
          <LoadingState />
        ) : result ? (
          <ResultCanvas result={result} />
        ) : (
          <EmptyState />
        )}
      </div>

      {error ? (
        <div
          role="alert"
          className="fixed left-1/2 top-5 z-50 w-[min(calc(100%-2rem),28rem)] -translate-x-1/2 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-center text-sm text-red-700 shadow-[0_14px_40px_rgba(127,29,29,0.12)]"
        >
          {error}
        </div>
      ) : generationWarning ? (
        <div
          role="status"
          className="fixed left-1/2 top-5 z-50 w-[min(calc(100%-2rem),28rem)] -translate-x-1/2 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-center text-sm text-amber-800 shadow-[0_14px_40px_rgba(120,80,20,0.10)]"
        >
          {generationWarning}
        </div>
      ) : speechNotice ? (
        <div
          role="status"
          className="fixed left-1/2 top-5 z-50 w-[min(calc(100%-2rem),28rem)] -translate-x-1/2 rounded-2xl border border-[#d8d8d0] bg-white px-5 py-3 text-center text-sm text-[#646a64] shadow-[0_14px_40px_rgba(30,41,59,0.10)]"
        >
          {speechNotice}
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-3xl items-end gap-2 rounded-[1.6rem] border border-[#d8d8d0] bg-white/92 p-1.5 shadow-[0_18px_54px_rgba(47,57,52,0.14)] backdrop-blur sm:bottom-6"
      >
        <label htmlFor="speech-input" className="sr-only">
          Speech input
        </label>
        <Textarea
          id="speech-input"
          value={displayValue}
          onChange={(event) => {
            setCapturedInput(event.target.value);
            setLiveTranscript("");
          }}
          onKeyDown={handleInputKeyDown}
          placeholder="Type here or start speaking..."
          rows={1}
          className="min-h-14 flex-1 resize-none rounded-[1.25rem] border-0 px-5 py-[1.05rem] text-base leading-6 shadow-none focus:ring-0"
        />
        <Button
          type="submit"
          disabled={!displayValue.trim() || isGenerating}
          className="h-14 w-14 shrink-0 rounded-[1.15rem] bg-[#ecebe3] px-0 text-[#202521] transition duration-200 hover:bg-[#e2e0d6] active:scale-[0.97]"
          aria-label="Submit input"
        >
          {isGenerating ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <ArrowUp className="h-5 w-5" aria-hidden="true" />
          )}
        </Button>
        <Button
          type="button"
          onClick={() => void startTranscription()}
          className={`h-14 w-14 shrink-0 rounded-[1.15rem] px-0 transition duration-200 active:scale-[0.97] ${
            speechStatus === "idle"
              ? "bg-[#202521] text-white"
              : "bg-red-600 text-white"
          }`}
          aria-label={
            speechStatus === "idle" ? "Start microphone" : "Stop microphone"
          }
        >
          {speechStatus === "connecting" ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : speechStatus === "listening" ? (
            <MicOff className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Mic className="h-5 w-5" aria-hidden="true" />
          )}
        </Button>
      </form>
    </main>
  );
}
