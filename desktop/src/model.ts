import { createFunctionGemmaPitchModelAdapter, PitchModelError, pitchFailureCode } from "../../lib/pitch/model.ts";
import type { PitchModelInput } from "../../lib/pitch/types.ts";
import { invoke } from "./tauri.ts";

let nextRequestId = 0;

export const desktopPitchModel = createFunctionGemmaPitchModelAdapter(async (input: PitchModelInput, signal: AbortSignal) => {
  const requestId = `${Date.now()}-${++nextRequestId}`;
  const onAbort = () => { void invoke("cancel_pitch", { requestId }).catch(() => {}); };
  if (signal.aborted) throw new DOMException("Pitch evaluation was cancelled.", "AbortError");
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await invoke("evaluate_pitch", { requestId, input });
  } catch (error) {
    if (signal.aborted) throw new DOMException("Pitch evaluation was cancelled.", "AbortError");
    throw new PitchModelError(pitchFailureCode(error));
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
});
