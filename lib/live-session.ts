export type QueuedLiveTurn = {
  input: string;
  sequence: number;
};

export type FinalizedSpeechTurn = {
  transcript: string;
  at: number;
};

export function beginsWithImagineCommand(value: string) {
  return /^\s*imagine\b/i.test(value);
}

export function enqueueLiveTurn(
  queue: QueuedLiveTurn[],
  turn: QueuedLiveTurn
) {
  queue.push(turn);
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
  if (!previous) {
    return false;
  }
  return (
    previous.transcript.trim().toLocaleLowerCase() ===
      transcript.trim().toLocaleLowerCase() &&
    at - previous.at >= 0 &&
    at - previous.at <= windowMs
  );
}
