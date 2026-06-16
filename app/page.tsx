"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2, Mic, MicOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ImagineResponse = {
  text: string;
  imageUrl: string;
  imagePrompt: string;
  mode: "existing-image" | "local-image";
  textMode: "gemini" | "local" | "local-fallback";
};

type VisualState = {
  result: ImagineResponse | null;
  neuralInputLayerPinned: boolean;
  beakerStage: number;
};

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
const CELL_IMAGE_URL = "/cell.png";
const BEAKER_PROMPT_PREFIX = "Local beaker sequence";
const BEAKER_EMPTY_IMAGE_URL = "/beaker.png";
const BEAKER_200ML_IMAGE_URL = "/beaker_200ml.png";
const BEAKER_BLUE_IMAGE_URL = "/beaker_blue.png";
const BEAKER_BUNSEN_IMAGE_URL = "/beaker_bunsen.png";
const BEAKER_PATTERN = /\bbeakers?\b/i;
const BEAKER_200ML_WATER_PATTERN =
  /(?=.*\bwater\b)(?=.*\b(200\s*ml|200\s*millilit(?:er|re)s?|two hundred\s*(?:ml|millilit(?:er|re)s?))\b)/i;
const BEAKER_BLUE_WATER_PATTERN = /(?=.*\bblue\b)(?=.*\bwater\b)/i;
const BEAKER_BUNSEN_PATTERN = /\bbunsen\s*burners?\b/i;
const NEURAL_NETWORK_IMAGE_URL = "/neuralnet.png";
const NEURAL_NETWORK_IMAGE_PROMPT = "Local neural network layer diagram";
const NEURAL_INPUT_LAYER_IMAGE_PROMPT =
  "Local neural network input layer focus diagram";
const NEURAL_INPUT_LAYER_PATTERN = /\binput\s*layers?\b/i;
const NEURAL_NETWORK_PATTERN =
  /\b(neural\s*networks?|neural\s*nets?|neurons?|artificial\s*intelligence|\bai\b|machine\s*learning|deep\s*learning|hidden\s*layers?|input\s*layers?|output\s*layers?|weights?|biases?|activation\s*functions?|backpropagation|perceptrons?|transformers?|convolutional|recurrent|\bcnn\b|\brnn\b|\blstm\b|\bmlp\b|model\s*training)\b/i;
const DIFFERENT_NEURAL_FOCUS_PATTERN =
  /\b(hidden\s*layers?|output\s*layers?|weights?|biases?|backpropagation|perceptrons?|transformers?|convolutional|recurrent|\bcnn\b|\brnn\b|\blstm\b|\bmlp\b|model\s*training)\b/i;
const AERODYNAMICS_IMAGE_URL = "/aerodynamics.png";
const AERODYNAMICS_PATTERN =
  /\b(aerodynamics?|air\s*flow|drag|lift|downforce|streamlines?|wind tunnel|turbulence|laminar|pressure|air resistance|fluid dynamics|spoilers?|wings?|airplanes?|aircraft|cars?|vehicles?|velocity|wake|cfd)\b/i;
const LOCAL_VISUAL_PROMPT_PREFIX = "Fast local visual selected for:";

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

  const supportedType = [
    "audio/webm;codecs=opus",
    "audio/webm",
  ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType));

  return supportedType ?? "";
}

function isClearCommand(speech: string) {
  return /^clear[.!?]?$/i.test(speech.trim());
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

function createLocalImageResult(imageUrl: string, imagePrompt: string) {
  return {
    text: "",
    imageUrl,
    imagePrompt,
    mode: "local-image",
    textMode: "local"
  } satisfies ImagineResponse;
}

function getBeakerImageUrl(stage: number) {
  if (stage >= 4) {
    return BEAKER_BUNSEN_IMAGE_URL;
  }

  if (stage === 3) {
    return BEAKER_BLUE_IMAGE_URL;
  }

  if (stage === 2) {
    return BEAKER_200ML_IMAGE_URL;
  }

  return BEAKER_EMPTY_IMAGE_URL;
}

function getBeakerAlt(stage: number) {
  if (stage >= 4) {
    return "Blue water in a beaker over a Bunsen burner";
  }

  if (stage === 3) {
    return "Beaker filled with blue water";
  }

  if (stage === 2) {
    return "Beaker filled with 200 ml of water";
  }

  return "Empty labeled beaker";
}

function getRequestedBeakerStage(speech: string) {
  if (BEAKER_BUNSEN_PATTERN.test(speech)) {
    return 4;
  }

  if (BEAKER_BLUE_WATER_PATTERN.test(speech)) {
    return 3;
  }

  if (BEAKER_200ML_WATER_PATTERN.test(speech)) {
    return 2;
  }

  if (BEAKER_PATTERN.test(speech)) {
    return 1;
  }

  return 0;
}

function getNextBeakerStage(currentStage: number, requestedStage: number) {
  if (requestedStage === 0) {
    return 0;
  }

  if (requestedStage <= currentStage) {
    return currentStage;
  }

  if (requestedStage === currentStage + 1) {
    return requestedStage;
  }

  return currentStage;
}

function isBeakerResponse(result: ImagineResponse) {
  return result.imagePrompt.startsWith(BEAKER_PROMPT_PREFIX);
}

function shouldKeepBeakerVisual(currentState: VisualState, nextResult: ImagineResponse) {
  return (
    currentState.beakerStage > 0 &&
    currentState.result !== null &&
    (isClassroomFallbackResponse(nextResult) ||
      nextResult.imagePrompt === "Fast local visual selected for: water cycle")
  );
}

function isNeuralNetworkResponse(result: ImagineResponse) {
  return (
    result.imageUrl === NEURAL_NETWORK_IMAGE_URL ||
    result.imagePrompt === NEURAL_NETWORK_IMAGE_PROMPT ||
    result.imagePrompt === NEURAL_INPUT_LAYER_IMAGE_PROMPT ||
    NEURAL_NETWORK_PATTERN.test(`${result.imagePrompt} ${result.text}`)
  );
}

function shouldUseNeuralNetworkImage(result: ImagineResponse) {
  return (
    result.imageUrl === NEURAL_NETWORK_IMAGE_URL ||
    NEURAL_NETWORK_PATTERN.test(`${result.imagePrompt} ${result.text}`)
  );
}

function shouldFocusNeuralInputLayer(result: ImagineResponse, speech: string) {
  return (
    result.imagePrompt === NEURAL_INPUT_LAYER_IMAGE_PROMPT ||
    NEURAL_INPUT_LAYER_PATTERN.test(
      `${speech} ${result.imagePrompt}`
    )
  );
}

function shouldUseCellImage(result: ImagineResponse) {
  return (
    result.imageUrl === CELL_IMAGE_URL ||
    /cell/i.test(`${result.imagePrompt} ${result.text}`)
  );
}

function shouldUseAerodynamicsImage(result: ImagineResponse) {
  return (
    result.imageUrl === AERODYNAMICS_IMAGE_URL ||
    AERODYNAMICS_PATTERN.test(`${result.imagePrompt} ${result.text}`)
  );
}

function isClassroomFallbackResponse(result: ImagineResponse) {
  return (
    result.imagePrompt.startsWith(LOCAL_VISUAL_PROMPT_PREFIX) &&
    result.imagePrompt.includes("classroom learning")
  );
}

function shouldKeepNeuralInputLayerVisual(
  currentState: VisualState,
  nextResult: ImagineResponse,
  speech: string
) {
  if (!currentState.neuralInputLayerPinned || !currentState.result) {
    return false;
  }

  if (shouldFocusNeuralInputLayer(nextResult, speech)) {
    return false;
  }

  if (isClassroomFallbackResponse(nextResult)) {
    return true;
  }

  return (
    isNeuralNetworkResponse(nextResult) &&
    !DIFFERENT_NEURAL_FOCUS_PATTERN.test(speech)
  );
}

function formatNoteBullets(text: string) {
  const lineBullets = text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^[-*•\d.)\s]+/, "")
        .replace(/^(key idea|student note|prompt|caption|description):\s*/i, "")
        .trim()
    )
    .filter(Boolean);

  if (lineBullets.length > 1) {
    return lineBullets;
  }

  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export default function Home() {
  const [teacherInput, setTeacherInput] = useState("");
  const [visualState, setVisualState] = useState<VisualState>({
    result: null,
    neuralInputLayerPinned: false,
    beakerStage: 0
  });
  const [error, setError] = useState("");
  const [speechNotice, setSpeechNotice] = useState("");
  const [speechStatus, setSpeechStatus] = useState<
    "idle" | "connecting" | "listening"
  >("idle");
  const [deepgramStatus, setDeepgramStatus] =
    useState<DeepgramStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const lastSubmittedSpeech = useRef("");
  const requestInFlight = useRef(false);
  const requestGeneration = useRef(0);
  const submitSpeechRef = useRef<(speech: string) => Promise<void>>(async () => {});
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const microphoneStream = useRef<MediaStream | null>(null);
  const transcriptionSocket = useRef<WebSocket | null>(null);
  const speechStopRequested = useRef(false);
  const deepgramConnected = useRef(false);
  const result = visualState.result;

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

  const startDeepgram = useCallback(async () => {
    if (speechStatus !== "idle") {
      stopDeepgram();
      return;
    }

    setError("");
    setSpeechNotice("Checking Deepgram API key...");
    setSpeechStatus("connecting");
    speechStopRequested.current = false;
    deepgramConnected.current = false;

    try {
      const status = await fetchDeepgramStatus();
      setDeepgramStatus(status);

      if (!status.configured || status.apiKeyStatus === "missing") {
        throw new Error("DEEPGRAM_API_KEY is not configured in .env.");
      }

      if (status.apiKeyStatus !== "valid") {
        throw new Error(status.apiKeyMessage);
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone capture is not supported in this browser.");
      }

      setSpeechNotice("Deepgram key verified. Requesting microphone access...");
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
          failDeepgram("Deepgram did not connect within 6 seconds.");
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
        setSpeechNotice(
          "Deepgram listening. Pause after a sentence to finish the turn."
        );
      };

      socket.onopen = () => {
        setSpeechNotice("Connected to local backend. Waiting for Deepgram...");
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
          setSpeechNotice("Deepgram turn detector connected.");
          return;
        }

        if (data.type === "Status") {
          if (data.status === "connected") {
            deepgramConnected.current = true;
            window.clearTimeout(connectionTimeout);
            startRecorder();
          } else if (data.status === "connecting_to_deepgram") {
            setSpeechNotice("Connecting to Deepgram...");
          }
          return;
        }

        if (data.type === "TurnInfo") {
          const turnTranscript = data.transcript?.trim() ?? "";
          if (!turnTranscript) {
            return;
          }

          setTeacherInput(turnTranscript);

          if (data.event === "EndOfTurn") {
            void submitSpeechRef.current(turnTranscript);
            setTeacherInput("");
          }
          return;
        }

        const transcript =
          data.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
        if (data.type === "Results" && transcript) {
          setTeacherInput(transcript);

          if (data.speech_final) {
            void submitSpeechRef.current(transcript);
            setTeacherInput("");
          }
        }
      };

      socket.onerror = () => {
        if (!speechStopRequested.current) {
          window.clearTimeout(connectionTimeout);
          failDeepgram("Deepgram websocket connection failed.");
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
              ? "Deepgram websocket closed unexpectedly."
              : "Deepgram websocket closed before connecting."
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

  const submitSpeech = useCallback(async (speech: string) => {
    const cleanSpeech = speech.trim();

    if (isClearCommand(cleanSpeech)) {
      requestGeneration.current += 1;
      lastSubmittedSpeech.current = cleanSpeech;
      requestInFlight.current = false;
      setError("");
      setIsLoading(false);
      setTeacherInput("");
      setVisualState({
        result: null,
        neuralInputLayerPinned: false,
        beakerStage: 0
      });
      console.log("Board cleared by clear prompt");
      return;
    }

    const requestedBeakerStage = getRequestedBeakerStage(cleanSpeech);

    if (requestedBeakerStage > 0) {
      requestGeneration.current += 1;
      lastSubmittedSpeech.current = cleanSpeech;
      requestInFlight.current = false;
      setError("");
      setIsLoading(false);
      setTeacherInput("");
      setVisualState((currentState) => {
        const nextStage = getNextBeakerStage(
          currentState.beakerStage,
          requestedBeakerStage
        );

        if (nextStage === currentState.beakerStage) {
          console.log("Beaker sequence unchanged", {
            currentStage: currentState.beakerStage,
            requestedStage: requestedBeakerStage,
            speech: cleanSpeech
          });
          return currentState;
        }

        console.log("Beaker sequence advanced", {
          from: currentState.beakerStage,
          to: nextStage,
          speech: cleanSpeech
        });

        return {
          result: createLocalImageResult(
            getBeakerImageUrl(nextStage),
            `${BEAKER_PROMPT_PREFIX} stage ${nextStage}`
          ),
          neuralInputLayerPinned: false,
          beakerStage: nextStage
        };
      });
      return;
    }

    if (
      cleanSpeech.length === 0 ||
      requestInFlight.current
    ) {
      return;
    }

    setError("");
    setIsLoading(true);
    requestInFlight.current = true;
    const requestId = ++requestGeneration.current;

    try {
      // Current demo sends typed teacher speech. The same API boundary can
      // later receive live transcript chunks from speech-to-text.
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
          problem?.detail ?? "The AI backend could not process the input."
        );
      }

      const data = (await response.json()) as ImagineResponse;
      lastSubmittedSpeech.current = cleanSpeech;
      setVisualState((currentState) => {
        if (requestId !== requestGeneration.current) {
          return currentState;
        }

        const nextPinsInputLayer = shouldFocusNeuralInputLayer(
          data,
          cleanSpeech
        );

        if (shouldKeepNeuralInputLayerVisual(currentState, data, cleanSpeech)) {
          console.log("Keeping neural input layer overlay pinned", {
            ignoredPrompt: data.imagePrompt,
            speech: cleanSpeech
          });
          return {
            result: currentState.result,
            neuralInputLayerPinned: true,
            beakerStage: 0
          };
        }

        if (shouldKeepBeakerVisual(currentState, data)) {
          console.log("Keeping beaker sequence visible", {
            stage: currentState.beakerStage,
            ignoredPrompt: data.imagePrompt,
            speech: cleanSpeech
          });
          return currentState;
        }

        return {
          result: data,
          neuralInputLayerPinned: nextPinsInputLayer,
          beakerStage: 0
        };
      });
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
      }
    }
  }, []);

  useEffect(() => {
    submitSpeechRef.current = submitSpeech;
  }, [submitSpeech]);

  useEffect(() => {
    return () => stopDeepgram();
  }, [stopDeepgram]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitSpeech(teacherInput);
  }

  const isNeuralNetworkResult =
    result &&
    (isNeuralNetworkResponse(result) || shouldUseNeuralNetworkImage(result));
  const isNeuralInputLayerResult =
    Boolean(result && visualState.neuralInputLayerPinned);
  const isBeakerResult = Boolean(result && isBeakerResponse(result));
  const isClassroomFallback = Boolean(result && isClassroomFallbackResponse(result));
  const displayImageUrl = isClassroomFallback
    ? ""
    : isNeuralNetworkResult
      ? NEURAL_NETWORK_IMAGE_URL
      : isBeakerResult
        ? getBeakerImageUrl(visualState.beakerStage)
      : result && shouldUseCellImage(result)
        ? CELL_IMAGE_URL
      : result && shouldUseAerodynamicsImage(result)
        ? AERODYNAMICS_IMAGE_URL
      : result?.imageUrl;
  const displayImageAlt = isClassroomFallback
    ? "Clear canvas"
    : isNeuralNetworkResult
      ? isNeuralInputLayerResult
        ? "Neural network input layer focus diagram"
        : "Neural network layer diagram"
      : isBeakerResult
        ? getBeakerAlt(visualState.beakerStage)
      : result && shouldUseCellImage(result)
        ? "Labeled animal cell diagram"
      : result && shouldUseAerodynamicsImage(result)
        ? "Aerodynamics airflow visualization around a car"
      : result?.imagePrompt;

  useEffect(() => {
    if (isNeuralInputLayerResult) {
      console.log("Neural input layer overlay visible", {
        imageUrl: displayImageUrl,
        imagePrompt: result?.imagePrompt,
        label: "ReLU function"
      });
    }
  }, [displayImageUrl, isNeuralInputLayerResult, result?.imagePrompt]);

  return (
    <main className="min-h-screen px-4 py-6 md:px-8">
      <section className="mx-auto max-w-5xl rounded border border-border bg-white p-4">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">IMAGINEv1</h1>
            <p className="text-sm text-muted-foreground">
              Real-time classroom speech to a visual note.
            </p>
          </div>
          <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
            {result ? `visual description: ${result.textMode}` : "waiting"}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <label
              htmlFor="teacher-speech"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Teacher speech input
            </label>
            <Textarea
              id="teacher-speech"
              value={teacherInput}
              onChange={(event) => setTeacherInput(event.target.value)}
              placeholder="Speak with Deepgram or type a short lesson explanation..."
              required
              rows={4}
            />
          </div>
          <div className="flex flex-col gap-2 self-end md:w-44">
            <Button
              type="submit"
              disabled={isLoading || teacherInput.trim().length === 0}
              className="w-full"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              Generate
            </Button>
            <Button
              type="button"
              onClick={() => {
                void startDeepgram();
              }}
              className={`w-full ${
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
              {speechStatus === "idle"
                ? "Start mic"
                : "Stop mic"}
            </Button>
          </div>
        </form>

        {error ? (
          <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {speechNotice ? (
          <p className="mb-4 rounded border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
            {speechNotice}
          </p>
        ) : null}

        {deepgramStatus ? (
          <p className="mb-4 rounded border border-border bg-muted p-3 text-xs text-muted-foreground">
            Deepgram {deepgramStatus.apiKeyStatus}; {deepgramStatus.model}{" "}
            {deepgramStatus.mode}
          </p>
        ) : null}

        <div className="overflow-hidden rounded bg-white">
          {isBeakerResult ? (
            <div className="min-h-[420px] bg-white p-2">
              <img
                src={displayImageUrl}
                alt={displayImageAlt}
                className="h-[min(68vh,720px)] min-h-[420px] w-full object-contain"
              />
            </div>
          ) : isNeuralNetworkResult ? (
            <div className="min-h-[420px] bg-black p-2">
              <div className="relative mx-auto aspect-[3056/2180] h-[min(68vh,720px)] min-h-[420px] max-w-full">
                <img
                  src={displayImageUrl}
                  alt={displayImageAlt}
                  className="absolute inset-0 h-full w-full object-contain"
                />
                {isNeuralInputLayerResult ? (
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox="0 0 3056 2180"
                    aria-hidden="true"
                  >
                    <ellipse
                      cx="126"
                      cy="1138"
                      rx="124"
                      ry="820"
                      fill="rgba(250, 204, 21, 0.1)"
                      stroke="#facc15"
                      strokeWidth="22"
                    />
                    <path
                      d="M270 430 L570 260"
                      fill="none"
                      stroke="#facc15"
                      strokeLinecap="round"
                      strokeWidth="16"
                    />
                    <rect
                      x="580"
                      y="180"
                      width="430"
                      height="130"
                      rx="18"
                      fill="#facc15"
                    />
                    <text
                      x="795"
                      y="265"
                      fill="#111827"
                      fontFamily="Arial, sans-serif"
                      fontSize="58"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      ReLU function
                    </text>
                  </svg>
                ) : null}
              </div>
            </div>
          ) : result ? (
            <div className="grid min-h-[420px] gap-6 bg-white px-5 py-6 md:grid-cols-[minmax(0,1fr)_minmax(260px,40%)] md:items-center md:px-8">
              <div className="order-2 md:order-1">
                <h2 className="mb-4 text-2xl font-semibold text-slate-800">
                  Image details
                </h2>
                <ul className="space-y-3 text-lg leading-8 text-slate-800 marker:text-sky-600">
                  {formatNoteBullets(result.text).map((bullet, index) => (
                    <li key={`${bullet}-${index}`} className="ml-6 list-disc pl-2">
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="order-1 md:order-2">
                {displayImageUrl ? (
                  <div className="aspect-[4/3] overflow-hidden rounded-sm bg-background shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                    {/* Backend selects an existing hosted image and returns its URL. */}
                    <img
                      src={displayImageUrl}
                      alt={displayImageAlt}
                      className={`h-full w-full ${
                        displayImageUrl === CELL_IMAGE_URL
                          || displayImageUrl === AERODYNAMICS_IMAGE_URL
                          ? "object-contain p-3"
                          : "object-cover"
                      }`}
                    />
                  </div>
                ) : (
                  <div className="aspect-[4/3] overflow-hidden rounded border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-6 text-center text-slate-400">
                    <ImageIcon className="h-8 w-8 text-slate-300 mb-2 animate-pulse" aria-hidden="true" />
                    <span className="font-semibold text-slate-500 text-sm mb-1">Canvas Clear</span>
                    <p className="text-xs max-w-[200px] leading-relaxed">
                      Say or type keywords like "cell", "neural network", "aerodynamics", or "beaker" to load a visual.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
              <ImageIcon className="h-8 w-8" aria-hidden="true" />
              Submit teacher speech to show one combined visual note.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
