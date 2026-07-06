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
  apiKeyStatus: "not_checked" | "missing" | "valid" | "invalid" | "unreachable" | "error";
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

type GenerateResponse = {
  title: string;
  bullets: string[];
  visual: GeneratedVisual | null;
  warning: string | null;
};

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

function getDiagramDocument(html: string) {
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
    place-items: center;
    background: #f4f5f6;
    color: #202124;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .diagram {
    width: min(100%, 760px);
    min-height: 360px;
    padding: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
  }
  .flow, .row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 14px;
    width: 100%;
  }
  .node, .lane {
    border: 1px solid #cfd5dc;
    background: #ffffff;
    border-radius: 14px;
    padding: 14px 16px;
    min-width: 120px;
    max-width: 220px;
    text-align: center;
    font-size: 15px;
    line-height: 1.35;
    font-weight: 600;
  }
  .node-primary { border-color: #2563eb; background: #eff6ff; }
  .node-secondary { border-color: #0f766e; background: #f0fdfa; }
  .node-accent { border-color: #c2410c; background: #fff7ed; }
  .node-muted { color: #5f6368; background: #f8fafc; }
  .arrow, .connector {
    color: #64748b;
    font-weight: 700;
    font-size: 22px;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 28px;
    border-radius: 999px;
    padding: 4px 10px;
    background: #e2e8f0;
    color: #334155;
    font-size: 12px;
    font-weight: 700;
  }
  .caption {
    color: #5f6368;
    font-size: 13px;
    line-height: 1.4;
  }
  .compact { padding: 8px 10px; min-width: 80px; }
  svg { max-width: 100%; height: auto; }
  @media (max-width: 520px) {
    .diagram { min-height: 300px; padding: 18px; }
    .node, .lane { max-width: 100%; }
  }
</style>
</head>
<body>${html}</body>
</html>`;
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

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center bg-white px-6 pb-32 pt-12 text-foreground">
      {isGenerating ? (
        <div
          role="status"
          className="flex items-center gap-3 text-lg font-medium text-[#5f6368]"
        >
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Generating notes
        </div>
      ) : result ? (
        <section
          aria-live="polite"
          className={`mx-auto grid w-full max-w-6xl gap-10 ${
            result.visual
              ? "lg:grid-cols-[minmax(0,0.85fr)_minmax(320px,1.15fr)] lg:items-center"
              : "max-w-3xl"
          }`}
        >
          <div>
            <h1 className="text-balance text-3xl font-semibold leading-tight tracking-[-0.035em] text-[#202124] sm:text-5xl">
              {result.title}
            </h1>
            <ul className="mt-8 space-y-4 text-lg leading-8 text-[#4f5358]">
              {result.bullets.map((bullet, index) => (
                <li
                  key={`${bullet}-${index}`}
                  className="border-l-2 border-[#c7cbcf] pl-5"
                >
                  {bullet}
                </li>
              ))}
            </ul>
          </div>

          {result.visual ? (
            <div className="overflow-hidden rounded-[1.75rem] bg-[#f4f5f6]">
              {result.visual.kind === "diagram" ? (
                <iframe
                  title={result.visual.alt}
                  sandbox=""
                  srcDoc={getDiagramDocument(result.visual.html)}
                  className="h-[min(65dvh,520px)] w-full border-0"
                />
              ) : (
                <img
                  src={result.visual.dataUrl}
                  alt={result.visual.alt}
                  className="max-h-[65dvh] w-full object-contain"
                />
              )}
              <div className="px-5 py-3 text-xs leading-5 text-[#6f7378]">
                <p>
                  {result.visual.kind === "diagram"
                    ? "HTML diagram"
                    : "AI-generated visual"}
                </p>
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <h1 className="text-balance text-center text-2xl font-medium tracking-[-0.025em] text-[#202124] sm:text-3xl">
          Start speaking to generate
        </h1>
      )}

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
          className="fixed left-1/2 top-5 z-50 w-[min(calc(100%-2rem),28rem)] -translate-x-1/2 rounded-2xl border border-border bg-white px-5 py-3 text-center text-sm text-muted-foreground shadow-[0_14px_40px_rgba(30,41,59,0.10)]"
        >
          {speechNotice}
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-3xl items-end gap-2 rounded-[2rem] border border-border bg-white p-1.5 shadow-[0_16px_48px_rgba(30,41,59,0.12)] sm:bottom-6"
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
          className="min-h-14 flex-1 resize-none rounded-[1.65rem] border-0 px-5 py-[1.05rem] text-base leading-6 shadow-none focus:ring-0"
        />
        <Button
          type="submit"
          disabled={!displayValue.trim() || isGenerating}
          className="h-14 w-14 shrink-0 rounded-full bg-[#eceff1] px-0 text-[#202124] transition duration-200 hover:bg-[#e2e6e9] active:scale-[0.97]"
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
          className={`h-14 w-14 shrink-0 rounded-full px-0 transition duration-200 active:scale-[0.97] ${
            speechStatus === "idle"
              ? "bg-[#202124] text-white"
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
