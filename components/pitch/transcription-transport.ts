"use client";

import { API_BASE_URL } from "../../lib/api-base.ts";
import { FRONTEND_ONLY_NOTICE, isFrontendOnlyDeployment } from "../../lib/deployment-mode.ts";
import { PitchUtteranceNormalizer, type DeepgramBoundaryMessage } from "../../lib/pitch/utterances.ts";

export type PitchSpeechStatus = "idle" | "connecting" | "listening" | "error";
export type PitchTranscriptionCallbacks = {
  onStatus: (status: PitchSpeechStatus) => void;
  onTranscript: (transcript: string) => void;
  onUtterance: (utterance: string) => void;
  onError: (message: string) => void;
};
type SocketLike = {
  readyState: number;
  send: (data: string | ArrayBuffer) => void;
  close: (code?: number, reason?: string) => void;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
};
type RecorderLike = {
  state: string;
  start: (timeslice?: number) => void;
  stop: () => void;
  ondataavailable: ((event: BlobEvent) => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
};
export type PitchTranscriptionDependencies = {
  getUserMedia: () => Promise<MediaStream>;
  createWebSocket: (url: string) => SocketLike;
  createRecorder: (stream: MediaStream) => RecorderLike;
  fetchStatus: () => Promise<{ configured: boolean; apiKeyStatus: string; apiKeyMessage: string }>;
  setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
};

const SOCKET_OPEN = 1;
const SOCKET_CLOSED = 3;

function getTranscriptionWsUrl() {
  const url = new URL(API_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/transcribe";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function preferredRecorder(stream: MediaStream): RecorderLike {
  if (typeof MediaRecorder === "undefined") throw new Error("Microphone recording is not supported in this browser.");
  const mimeType = ["audio/webm;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
}

/** Browser defaults are separate so the transport can be fully fake-tested. */
export function createBrowserTranscriptionDependencies(): PitchTranscriptionDependencies {
  return {
    getUserMedia: () => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone capture is not supported in this browser.");
      return navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: true, echoCancellation: true, noiseSuppression: true } });
    },
    createWebSocket: (url) => new WebSocket(url),
    createRecorder: preferredRecorder,
    fetchStatus: async () => {
      if (isFrontendOnlyDeployment()) throw new Error(FRONTEND_ONLY_NOTICE);
      const url = new URL(API_BASE_URL);
      url.pathname = "/api/transcribe/status";
      url.searchParams.set("checkKey", "true");
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("The local backend could not check transcription status.");
      return response.json() as Promise<{ configured: boolean; apiKeyStatus: string; apiKeyMessage: string }>;
    },
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (id) => clearTimeout(id)
  };
}

function messageError(message: DeepgramBoundaryMessage) {
  return message.message || message.description || message.code || "Speech transcription failed.";
}

/** Owns one microphone/websocket session and ignores events from replaced sessions. */
export class PitchTranscriptionTransport {
  private sessionId = 0;
  private recorder: RecorderLike | null = null;
  private stream: MediaStream | null = null;
  private socket: SocketLike | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private normalizer = new PitchUtteranceNormalizer();
  private readonly callbacks: PitchTranscriptionCallbacks;
  private readonly dependencies: PitchTranscriptionDependencies;

  constructor(callbacks: PitchTranscriptionCallbacks, dependencies: PitchTranscriptionDependencies = createBrowserTranscriptionDependencies()) {
    this.callbacks = callbacks;
    this.dependencies = dependencies;
  }

  async start() {
    this.stop(false);
    const sessionId = ++this.sessionId;
    const ownsSession = () => this.sessionId === sessionId;
    this.normalizer.reset();
    this.callbacks.onStatus("connecting");
    try {
      const status = await this.dependencies.fetchStatus();
      if (!ownsSession()) return;
      if (!status.configured || status.apiKeyStatus === "missing") throw new Error("DEEPGRAM_API_KEY is not configured in .env.");
      if (status.apiKeyStatus !== "valid") throw new Error(status.apiKeyMessage || "Transcription is unavailable.");
      const stream = await this.dependencies.getUserMedia();
      if (!ownsSession()) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream;
      const socket = this.dependencies.createWebSocket(getTranscriptionWsUrl());
      this.socket = socket;
      let connected = false;
      this.timeout = this.dependencies.setTimeout(() => {
        if (ownsSession() && !connected) this.fail("Transcription did not connect within 6 seconds.", sessionId);
      }, 6000);
      socket.onmessage = (event) => {
        if (!ownsSession()) return;
        let message: DeepgramBoundaryMessage | null = null;
        try {
          const parsed: unknown = JSON.parse(String(event.data));
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) message = parsed as DeepgramBoundaryMessage;
        } catch { return; }
        if (!message) return;
        if (message.type === "Error") { this.fail(messageError(message), sessionId); return; }
        if (message.type === "Status") {
          if (message.status !== "connected" || connected) return;
          connected = true;
          this.clearTimeout();
          this.startRecorder(stream, socket, sessionId);
          return;
        }
        const normalized = this.normalizer.consume(message);
        if (!normalized) return;
        this.callbacks.onTranscript(normalized.transcript);
        if (normalized.utterance) this.callbacks.onUtterance(normalized.utterance);
      };
      socket.onerror = () => this.fail("Transcription websocket connection failed.", sessionId);
      socket.onclose = () => {
        if (ownsSession()) this.fail(connected ? "Transcription websocket closed unexpectedly." : "Transcription websocket closed before connecting.", sessionId);
      };
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Microphone streaming failed.", sessionId);
    }
  }

  stop(reportIdle = true) {
    this.sessionId += 1;
    this.clearTimeout();
    if (this.recorder) { this.recorder.ondataavailable = null; this.recorder.onerror = null; }
    try { if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop(); } catch { /* cleanup continues for other resources */ }
    this.recorder = null;
    this.stream?.getTracks().forEach((track) => { try { track.stop(); } catch { /* release remaining tracks */ } });
    this.stream = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      try { if (socket.readyState === SOCKET_OPEN) socket.send("__stop__"); } catch { /* still close the socket */ }
      try { if (socket.readyState !== SOCKET_CLOSED) socket.close(1000, "Microphone stopped"); } catch { /* already closed */ }
    }
    this.normalizer.reset();
    if (reportIdle) this.callbacks.onStatus("idle");
  }

  private startRecorder(stream: MediaStream, socket: SocketLike, sessionId: number) {
    try {
      const recorder = this.dependencies.createRecorder(stream);
      this.recorder = recorder;
      recorder.ondataavailable = (audio) => {
        if (this.sessionId !== sessionId || audio.data.size === 0 || socket.readyState !== SOCKET_OPEN) return;
        void audio.data.arrayBuffer().then((buffer) => {
          if (this.sessionId === sessionId && this.socket === socket && socket.readyState === SOCKET_OPEN) socket.send(buffer);
        }).catch(() => this.fail("Microphone audio could not be read.", sessionId));
      };
      recorder.onerror = () => this.fail("Microphone recording failed.", sessionId);
      recorder.start(250);
      this.callbacks.onStatus("listening");
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Microphone recording failed.", sessionId);
    }
  }

  private clearTimeout() {
    if (this.timeout !== null) this.dependencies.clearTimeout(this.timeout);
    this.timeout = null;
  }

  private fail(message: string, sessionId: number) {
    if (this.sessionId !== sessionId) return;
    this.stop(false);
    this.callbacks.onStatus("error");
    this.callbacks.onError(message);
  }
}
