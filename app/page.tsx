"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PitchVisual } from "@/components/pitch-visuals";
import { Textarea } from "@/components/ui/textarea";

type PitchResponse = {
  text: string;
  imageUrl: string;
  imagePrompt: string;
  mode: "idle" | "slide";
  textMode: "keyword";
  status: "unconfigured" | "waiting" | "advanced" | "complete";
  slideTitle: string;
  slideSubtitle: string;
  bullets: string[];
  sequenceIndex: number;
  totalSteps: number;
  matchedKeyword: string;
  componentKey: string;
};

type PromptSource = "typed" | "speech";

type DeepgramMessage = {
  type?: string;
  status?: string;
  message?: string;
  description?: string;
  code?: string;
  event?: string;
  transcript?: string;
  apiKeyStatus?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
    }>;
  };
};

type DeepgramStatusResponse = {
  configured: boolean;
  mode: string;
  listenEndpoint: string;
  model: string;
  eotThreshold: string;
  eotTimeoutMs: string;
  apiKeyStatus: "not_checked" | "missing" | "valid" | "invalid" | "unreachable" | "error";
  apiKeyValid: boolean;
  apiKeyMessage: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8010";

function getEmptyPitchResponse(): PitchResponse {
  return {
    text: "",
    imageUrl: "",
    imagePrompt: "",
    mode: "idle",
    textMode: "keyword",
    status: "unconfigured",
    slideTitle: "",
    slideSubtitle: "",
    bullets: [],
    sequenceIndex: 0,
    totalSteps: 0,
    matchedKeyword: "",
    componentKey: ""
  };
}

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
    [
      "audio/webm;codecs=opus",
      "audio/webm",
    ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? ""
  );
}

function getDeepgramFailureMessage(message: DeepgramMessage) {
  return (
    message.message ??
    message.description ??
    message.code ??
    "Deepgram transcription failed."
  );
}

async function fetchDeepgramStatus() {
  const response = await fetch(getTranscriptionStatusUrl(), {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("The local backend could not check Deepgram status.");
  }

  return (await response.json()) as DeepgramStatusResponse;
}

export default function Home() {
  const [captionInput, setCaptionInput] = useState("");
  const [pitchFrame, setPitchFrame] = useState<PitchResponse>(getEmptyPitchResponse);
  const [error, setError] = useState("");
  const [speechNotice, setSpeechNotice] = useState("");
  const [speechStatus, setSpeechStatus] = useState<
    "idle" | "connecting" | "listening"
  >("idle");
  const [isLoading, setIsLoading] = useState(false);
  const requestGeneration = useRef(0);
  const requestInFlight = useRef(false);
  const queuedSpeech = useRef<{ speech: string; source: PromptSource } | null>(null);
  const submitSpeechRef = useRef<
    (speech: string, source?: PromptSource) => Promise<void>
  >(async () => {});
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const microphoneStream = useRef<MediaStream | null>(null);
  const transcriptionSocket = useRef<WebSocket | null>(null);
  const speechStopRequested = useRef(false);
  const deepgramConnected = useRef(false);
  const hasActiveSlide = pitchFrame.mode === "slide";
  const isTitleOnlySlide =
    hasActiveSlide &&
    pitchFrame.slideTitle.length > 0 &&
    pitchFrame.slideSubtitle.length === 0 &&
    pitchFrame.bullets.length === 0 &&
    pitchFrame.imageUrl.length === 0;
  const isImageOnlySlide =
    hasActiveSlide &&
    pitchFrame.imageUrl.length > 0 &&
    pitchFrame.slideTitle.length === 0 &&
    pitchFrame.slideSubtitle.length === 0 &&
    pitchFrame.bullets.length === 0;
  const isComponentSlide =
    hasActiveSlide &&
    pitchFrame.componentKey.length > 0;

  const cleanupDeepgramConnection = useCallback((sendStop: boolean) => {
    const recorder = mediaRecorder.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    mediaRecorder.current = null;

    const stream = microphoneStream.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
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

  const stopDeepgram = useCallback(() => {
    speechStopRequested.current = true;
    deepgramConnected.current = false;
    cleanupDeepgramConnection(true);
    setSpeechStatus("idle");
    setSpeechNotice("");
  }, [cleanupDeepgramConnection]);

  const failDeepgram = useCallback(
    (message: string) => {
      if (speechStopRequested.current) {
        return;
      }

      speechStopRequested.current = true;
      deepgramConnected.current = false;
      cleanupDeepgramConnection(false);
      setSpeechStatus("idle");
      setSpeechNotice("");
      setError(message);
    },
    [cleanupDeepgramConnection]
  );

  const resetPitchSequence = useCallback(async () => {
    requestGeneration.current += 1;
    requestInFlight.current = false;
    queuedSpeech.current = null;
    setError("");
    setIsLoading(false);
    setCaptionInput("");
    setPitchFrame(getEmptyPitchResponse());

    await fetch(`${API_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherSpeech: "", resetSequence: true })
    }).catch(() => undefined);
  }, []);

  const submitSpeech = useCallback(async (
    speech: string,
    source: PromptSource = "typed"
  ) => {
    const cleanSpeech = speech.trim();

    if (cleanSpeech.length === 0) {
      return;
    }

    if (requestInFlight.current) {
      queuedSpeech.current = { speech: cleanSpeech, source };
      return;
    }

    setError("");
    setIsLoading(source === "typed");
    requestInFlight.current = true;
    const requestId = ++requestGeneration.current;

    try {
      const response = await fetch(`${API_BASE_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherSpeech: cleanSpeech })
      });

      if (requestId !== requestGeneration.current) {
        return;
      }

      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(
          problem?.detail ?? "The pitch sequence could not process the input."
        );
      }

      const data = (await response.json()) as PitchResponse;
      setPitchFrame(data);
      if (source === "typed") {
        setCaptionInput("");
      }
    } catch (requestError) {
      if (requestId !== requestGeneration.current) {
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unexpected request failure."
      );
    } finally {
      if (requestId === requestGeneration.current) {
        requestInFlight.current = false;
        setIsLoading(false);

        const queued = queuedSpeech.current;
        queuedSpeech.current = null;
        if (queued) {
          void submitSpeechRef.current(queued.speech, queued.source);
        }
      }
    }
  }, [resetPitchSequence]);

  useEffect(() => {
    submitSpeechRef.current = submitSpeech;
  }, [submitSpeech]);

  useEffect(() => {
    void resetPitchSequence();
  }, [resetPitchSequence]);

  const startDeepgram = useCallback(async () => {
    if (speechStatus !== "idle") {
      stopDeepgram();
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
          noiseSuppression: true,
        },
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
          failDeepgram("Transcription did not connect within 6 seconds.");
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

      const scanTranscript = (transcript: string) => {
        const cleanTranscript = transcript.trim();
        if (!cleanTranscript) {
          return;
        }

        setCaptionInput(cleanTranscript);
        void submitSpeechRef.current(cleanTranscript, "speech");
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
          failDeepgram(getDeepgramFailureMessage(data));
          return;
        }

        if (data.type === "Connected") {
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
          scanTranscript(data.transcript ?? "");
          return;
        }

        const transcript =
          data.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
        if (data.type === "Results" && transcript) {
          scanTranscript(transcript);
        }
      };

      socket.onerror = () => {
        if (!speechStopRequested.current) {
          window.clearTimeout(connectionTimeout);
          failDeepgram("Transcription websocket connection failed.");
        }
      };

      socket.onclose = () => {
        window.clearTimeout(connectionTimeout);
        mediaRecorder.current = null;
        microphoneStream.current?.getTracks().forEach((track) => track.stop());
        microphoneStream.current = null;
        transcriptionSocket.current = null;
        if (!speechStopRequested.current) {
          failDeepgram(
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
      failDeepgram(
        speechError instanceof Error
          ? speechError.message
          : "Microphone streaming failed."
      );
    }
  }, [failDeepgram, speechStatus, stopDeepgram]);

  useEffect(() => {
    return () => stopDeepgram();
  }, [stopDeepgram]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitSpeech(captionInput, "typed");
  }

  function handleCaptionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    void submitSpeech(captionInput, "typed");
  }

  return (
    <main className="min-h-screen overflow-hidden bg-white text-[#111318]">
      <section className="relative flex min-h-screen flex-col bg-white px-3 pb-20 pt-3 sm:px-4 sm:pb-24 sm:pt-4">
        <div className="flex min-h-0 flex-1 items-stretch">
          <div className="relative mx-auto flex w-full max-w-[1680px] overflow-hidden bg-white">

            {isComponentSlide ? (
              <div className="pitch-enter flex min-h-[calc(100vh-6.5rem)] w-full items-center justify-center bg-white px-[clamp(1rem,5vw,5rem)] py-[clamp(1rem,4vh,3rem)]">
                <PitchVisual
                  componentKey={pitchFrame.componentKey}
                  title={pitchFrame.slideTitle}
                  subtitle={pitchFrame.slideSubtitle}
                  bullets={pitchFrame.bullets}
                  imageUrl={pitchFrame.imageUrl}
                  imagePrompt={pitchFrame.imagePrompt}
                />
              </div>
            ) : isTitleOnlySlide ? (
              <div className="flex min-h-[calc(100vh-6.5rem)] w-full items-center justify-center bg-white px-[clamp(1.5rem,7vw,8rem)]">
                <h1 className="pitch-pop max-w-6xl text-center text-[clamp(3rem,8vw,8.5rem)] font-black uppercase leading-[0.94] tracking-normal text-[#111318]">
                  {pitchFrame.slideTitle}
                </h1>
              </div>
            ) : isImageOnlySlide ? (
              <div className="flex min-h-[calc(100vh-6.5rem)] w-full items-center justify-center bg-white px-[clamp(1.5rem,6vw,7rem)] py-[clamp(1.5rem,6vh,5rem)]">
                <img
                  src={pitchFrame.imageUrl}
                  alt={pitchFrame.imagePrompt}
                  className="pitch-pop max-h-[min(74vh,820px)] max-w-[min(86vw,1280px)] object-contain"
                />
              </div>
            ) : hasActiveSlide ? (
              <div className="pitch-enter grid min-h-[calc(100vh-6.5rem)] w-full gap-10 bg-white px-[clamp(1.5rem,5vw,5rem)] py-[clamp(1.5rem,6vh,5rem)] lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)] lg:items-center">
                <div className="max-w-4xl pitch-stagger">
                  <p className="mb-5 text-xs font-semibold uppercase tracking-[0.32em] text-[#8f6c36]">
                    IMAGINEv1
                  </p>
                  <h1 className="text-balance text-[clamp(2.8rem,7vw,7.5rem)] font-semibold leading-[0.95] tracking-normal text-[#151515]">
                    {pitchFrame.slideTitle}
                  </h1>
                  {pitchFrame.slideSubtitle ? (
                    <p className="mt-8 max-w-3xl text-[clamp(1.1rem,2vw,1.75rem)] leading-8 text-[#4b4a45]">
                      {pitchFrame.slideSubtitle}
                    </p>
                  ) : null}
                </div>

                <div className="min-w-0">
                  {pitchFrame.imageUrl ? (
                    <div className="pitch-pop aspect-[4/3] overflow-hidden bg-white">
                      <img
                        src={pitchFrame.imageUrl}
                        alt={pitchFrame.imagePrompt || pitchFrame.slideTitle}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : pitchFrame.bullets.length > 0 ? (
                    <ul className="pitch-stagger space-y-5 text-[clamp(1.05rem,1.8vw,1.5rem)] leading-8 text-[#34332f]">
                      {pitchFrame.bullets.map((bullet, index) => (
                        <li key={`${bullet}-${index}`} className="border-l-2 border-[#b7873f] pl-5">
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="min-h-[calc(100vh-6.5rem)] w-full bg-white" aria-hidden="true" />
            )}
          </div>
        </div>

        {(error || speechNotice) ? (
          <div className="pointer-events-none fixed inset-x-4 bottom-28 z-20 mx-auto max-w-3xl sm:bottom-32">
            <p
              className={`rounded-full border px-4 py-2 text-center text-sm shadow-[0_12px_30px_rgba(30,27,22,0.12)] ${
                error
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-[#d9d3c7] bg-[#fbfaf6] text-[#5d5a52]"
              }`}
            >
              {error || speechNotice}
            </p>
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="fixed inset-x-4 bottom-3 z-30 mx-auto flex max-w-3xl items-end gap-2 rounded-full border border-[#e5e5e5] bg-white p-1.5 shadow-[0_12px_34px_rgba(17,19,24,0.12)] sm:bottom-4"
        >
          <Button
            type="button"
            onClick={() => {
              void startDeepgram();
            }}
            className={`h-11 min-w-28 rounded-full px-4 text-sm font-semibold shadow-[0_8px_18px_rgba(17,19,24,0.16)] sm:h-12 sm:min-w-32 ${
              speechStatus === "idle"
                ? "bg-[#151515] text-white"
                : "bg-[#8f2d2d] text-white"
            }`}
            aria-label={speechStatus === "idle" ? "Start microphone" : "Stop microphone"}
          >
            {speechStatus === "connecting" ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : speechStatus === "listening" ? (
              <MicOff className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Mic className="h-5 w-5" aria-hidden="true" />
            )}
            {speechStatus === "idle" ? "Speak" : "Stop"}
          </Button>

          <Textarea
            aria-label="Caption input"
            value={captionInput}
            onChange={(event) => setCaptionInput(event.target.value)}
            onKeyDown={handleCaptionKeyDown}
            placeholder="Caption input"
            rows={1}
            className="h-11 flex-1 rounded-full border-[#e5e5e5] bg-white px-4 py-2.5 text-sm leading-5 text-[#171717] placeholder:text-[#7a7a7a] focus:ring-[#151515] sm:h-12 sm:px-5 sm:text-base"
          />

          <Button
            type="submit"
            disabled={isLoading || captionInput.trim().length === 0}
            className="h-11 w-11 shrink-0 rounded-full bg-[#151515] p-0 text-white shadow-[0_8px_18px_rgba(17,19,24,0.16)] sm:h-12 sm:w-12"
            aria-label="Generate from caption"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-5 w-5" aria-hidden="true" />
            )}
          </Button>
        </form>
      </section>
    </main>
  );
}
