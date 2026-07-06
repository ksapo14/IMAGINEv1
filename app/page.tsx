"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff } from "lucide-react";
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

export default function Home() {
  const [capturedInput, setCapturedInput] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [error, setError] = useState("");
  const [speechNotice, setSpeechNotice] = useState("");
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>("idle");
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const microphoneStream = useRef<MediaStream | null>(null);
  const transcriptionSocket = useRef<WebSocket | null>(null);
  const speechStopRequested = useRef(false);
  const deepgramConnected = useRef(false);

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

  return (
    <main className="min-h-screen bg-white px-4 py-6 text-foreground md:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl flex-col">
        <header className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">IMAGINEv1</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Speech input scaffold
            </p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            Generation not configured
          </span>
        </header>

        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div className="max-w-md">
            <p className="text-lg font-medium">Blank workspace</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Keyword triggers and presentation slides have been removed.
              Captured input is ready for the future real-time generation
              pipeline.
            </p>
          </div>
        </div>

        {(error || speechNotice) ? (
          <p
            className={`mb-3 rounded border px-4 py-3 text-sm ${
              error
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-border bg-muted text-muted-foreground"
            }`}
          >
            {error || speechNotice}
          </p>
        ) : null}

        <div className="grid gap-3 border-t border-border pt-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <label
              htmlFor="speech-input"
              className="mb-2 block text-sm font-medium"
            >
              Captured speech
            </label>
            <Textarea
              id="speech-input"
              value={displayValue}
              onChange={(event) => {
                setCapturedInput(event.target.value);
                setLiveTranscript("");
              }}
              placeholder="Type here or start the microphone..."
              rows={3}
            />
          </div>
          <div className="flex gap-2 md:flex-col">
            <Button
              type="button"
              onClick={() => void startTranscription()}
              className={`flex-1 md:w-40 ${
                speechStatus === "idle"
                  ? ""
                  : "bg-red-600 text-white hover:opacity-90"
              }`}
            >
              {speechStatus === "connecting" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : speechStatus === "listening" ? (
                <MicOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Mic className="h-4 w-4" aria-hidden="true" />
              )}
              {speechStatus === "idle" ? "Start mic" : "Stop mic"}
            </Button>
            <Button
              type="button"
              disabled={!capturedInput && !liveTranscript}
              onClick={() => {
                setCapturedInput("");
                setLiveTranscript("");
                setError("");
              }}
              className="flex-1 bg-muted text-foreground shadow-none md:w-40"
            >
              Clear input
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
