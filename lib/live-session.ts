export type QueuedLiveTurn = { input: string; sequence: number };
export type FinalizedSpeechTurn = { transcript: string; at: number };
export type WakeCommandState = {
  phase: "idle" | "heardHey" | "armed";
  expiresAt: number;
};

export type WakeCommandResult = {
  command: string | null;
  state: WakeCommandState;
};

const MAX_QUEUED_TURNS = 2;
const MAX_INPUT_CHARACTERS = 4000;
export const WAKE_COMMAND_EXPIRY_MS = 8000;

export const IDLE_WAKE_COMMAND_STATE: WakeCommandState = {
  phase: "idle",
  expiresAt: 0
};

type SpokenToken = { value: string; end: number };

/** Token offsets let us recognize punctuation-tolerant wake words without matching substrings. */
function spokenTokens(transcript: string) {
  return Array.from(transcript.matchAll(/[\p{L}\p{N}'’]+/gu), (match): SpokenToken => ({
    value: match[0].toLocaleLowerCase(),
    end: (match.index ?? 0) + match[0].length
  }));
}

function cleanCommand(value: string) {
  return value.replace(/^[\s,.:;!?—–-]+/u, "").trim();
}

/**
 * Consume one finalized speech segment. Only a complete wake phrase can arm the
 * next segment, and every activation is consumed by exactly one command.
 */
export function consumeWakeCommand(
  current: WakeCommandState,
  transcript: string,
  at: number,
  expiryMs = WAKE_COMMAND_EXPIRY_MS
): WakeCommandResult {
  const cleanTranscript = transcript.trim();
  if (!cleanTranscript) return { command: null, state: current };

  const state = current.expiresAt >= at ? current : IDLE_WAKE_COMMAND_STATE;
  const tokens = spokenTokens(cleanTranscript);
  const wakeIndex = tokens.findIndex((token, index) => (
    token.value === "hey" && tokens[index + 1]?.value === "imagine"
  ));

  if (wakeIndex >= 0) {
    const command = cleanCommand(cleanTranscript.slice(tokens[wakeIndex + 1].end));
    return command
      ? { command, state: IDLE_WAKE_COMMAND_STATE }
      : { command: null, state: { phase: "armed", expiresAt: at + expiryMs } };
  }

  if (state.phase === "heardHey" && tokens[0]?.value === "imagine") {
    const command = cleanCommand(cleanTranscript.slice(tokens[0].end));
    return command
      ? { command, state: IDLE_WAKE_COMMAND_STATE }
      : { command: null, state: { phase: "armed", expiresAt: at + expiryMs } };
  }

  if (state.phase === "armed") {
    return { command: cleanTranscript, state: IDLE_WAKE_COMMAND_STATE };
  }

  if (tokens.length === 1 && tokens[0].value === "hey") {
    return {
      command: null,
      state: { phase: "heardHey", expiresAt: at + expiryMs }
    };
  }

  return { command: null, state: IDLE_WAKE_COMMAND_STATE };
}

/** Keep two FIFO requests; later speech is folded into the newest waiting turn. */
export function enqueueLiveTurn(queue: QueuedLiveTurn[], turn: QueuedLiveTurn) {
  const clean = turn.input.trim();
  if (!clean) return;
  if (queue.length < MAX_QUEUED_TURNS) {
    queue.push({ input: clean.slice(0, MAX_INPUT_CHARACTERS), sequence: turn.sequence });
    return;
  }
  const newest = queue[queue.length - 1];
  const combined = `${newest.input} ${clean}`.trim();
  queue[queue.length - 1] = {
    input: combined.slice(-MAX_INPUT_CHARACTERS).trimStart(),
    sequence: turn.sequence
  };
}

export function dequeueLiveTurn(queue: QueuedLiveTurn[]) {
  return queue.shift() ?? null;
}

export function isDuplicateFinalizedSpeech(
  previous: FinalizedSpeechTurn | null,
  transcript: string,
  at: number,
  windowMs = 1500
) {
  if (!previous) return false;
  return previous.transcript.trim().toLocaleLowerCase() === transcript.trim().toLocaleLowerCase()
    && at - previous.at >= 0
    && at - previous.at <= windowMs;
}
