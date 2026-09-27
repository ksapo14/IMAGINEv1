import type { PitchTranscriptionCallbacks, PitchTranscriptionTransport } from "../../components/pitch/pitch-workspace.tsx";
import { PitchUtteranceNormalizer, type DeepgramBoundaryMessage } from "../../lib/pitch/utterances.ts";
import { invoke, listen } from "./tauri.ts";

type TranscriptionEvent = DeepgramBoundaryMessage & { sessionId: string; status?: string };

const MAX_PENDING_AUDIO_CHUNKS = 8;

function preferredRecorder(stream: MediaStream): MediaRecorder {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    throw new Error("This Windows WebView cannot record WebM/Opus microphone audio.");
  }
  return new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
}

/** One session owns one microphone, recorder, Deepgram stream, and event listener. */
export class DesktopTranscriptionTransport implements PitchTranscriptionTransport {
  private sessionId: string | null = null;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private unlisten: (() => void) | null = null;
  private normalizer = new PitchUtteranceNormalizer();
  private sequence = 0;
  private pendingAudio = 0;
  private audioTail: Promise<void> = Promise.resolve();

  private readonly callbacks: PitchTranscriptionCallbacks;

  constructor(callbacks: PitchTranscriptionCallbacks) { this.callbacks = callbacks; }

  async start(): Promise<void> {
    this.stop(false);
    const sessionId = crypto.randomUUID();
    this.sessionId = sessionId;
    this.normalizer.reset();
    this.callbacks.onStatus("connecting");
    try {
      const unlisten = await listen<TranscriptionEvent>("pitch-transcription", (message) => this.onMessage(sessionId, message));
      if (this.sessionId !== sessionId) { unlisten(); return; }
      this.unlisten = unlisten;
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone capture is unavailable in this WebView.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: true, echoCancellation: true, noiseSuppression: true } });
      if (this.sessionId !== sessionId) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream;
      const recorder = preferredRecorder(stream);
      this.recorder = recorder;
      await invoke<void>("start_transcription", { sessionId });
      if (this.sessionId !== sessionId) {
        // Stop may have raced the native handshake before Rust stored this session.
        await invoke<void>("stop_transcription", { sessionId }).catch(() => {});
        return;
      }
      recorder.ondataavailable = (event) => {
        if (event.data.size === 0 || this.sessionId !== sessionId) return;
        if (this.pendingAudio >= MAX_PENDING_AUDIO_CHUNKS) { this.fail(sessionId, "Transcription cannot keep up with microphone audio."); return; }
        this.pendingAudio += 1;
        const sequence = this.sequence++;
        this.audioTail = this.audioTail.then(async () => {
          if (this.sessionId !== sessionId) return;
          const audio = Array.from(new Uint8Array(await event.data.arrayBuffer()));
          if (this.sessionId === sessionId) await invoke<void>("submit_audio", { sessionId, sequence, audio });
        }).catch(() => this.fail(sessionId, "Microphone audio could not be sent to Deepgram.")).finally(() => {
          if (this.sessionId === sessionId) this.pendingAudio -= 1;
        });
      };
      recorder.onerror = () => this.fail(sessionId, "Microphone recording failed.");
      recorder.start(250);
      this.callbacks.onStatus("listening");
    } catch (error) {
      this.fail(sessionId, typeof error === "string" && error === "deepgram_key_missing"
        ? "Set DEEPGRAM_API_KEY in the desktop app's launch environment."
        : error instanceof Error ? error.message : "Transcription could not start.");
    }
  }

  stop(reportIdle = true): void {
    const sessionId = this.sessionId;
    this.sessionId = null;
    this.unlisten?.();
    this.unlisten = null;
    if (this.recorder) {
      this.recorder.ondataavailable = null;
      this.recorder.onerror = null;
      try { if (this.recorder.state !== "inactive") this.recorder.stop(); } catch { /* cleanup continues */ }
    }
    this.recorder = null;
    this.stream?.getTracks().forEach((track) => { try { track.stop(); } catch { /* cleanup continues */ } });
    this.stream = null;
    this.normalizer.reset();
    this.sequence = 0;
    this.pendingAudio = 0;
    this.audioTail = Promise.resolve();
    if (sessionId) void invoke("stop_transcription", { sessionId }).catch(() => {});
    if (reportIdle) this.callbacks.onStatus("idle");
  }

  private onMessage(sessionId: string, message: TranscriptionEvent): void {
    if (this.sessionId !== sessionId || message.sessionId !== sessionId) return;
    if (message.type === "Error") { this.fail(sessionId, "Deepgram transcription failed."); return; }
    if (message.type === "Status") {
      if (message.status === "connected") this.callbacks.onStatus("listening");
      return;
    }
    const normalized = this.normalizer.consume(message);
    if (!normalized) return;
    this.callbacks.onTranscript(normalized.transcript);
    if (normalized.utterance) this.callbacks.onUtterance(normalized.utterance);
  }

  private fail(sessionId: string, message: string): void {
    if (this.sessionId !== sessionId) return;
    this.stop(false);
    this.callbacks.onStatus("error");
    this.callbacks.onError(message);
  }
}

export function createDesktopTranscriptionTransport(callbacks: PitchTranscriptionCallbacks): PitchTranscriptionTransport {
  return new DesktopTranscriptionTransport(callbacks);
}
