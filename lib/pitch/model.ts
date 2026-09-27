import type { PitchDecision, PitchModelAdapter, PitchModelInput } from "./types.ts";

const SAFE_FAILURE_MESSAGES = {
  python_unavailable: "Local Python is unavailable. Check backend/.venv or set IMAGINE_PYTHON before starting the app.",
  dependency_missing: "The local Python environment needs PyTorch and Transformers.",
  load_failure: "FunctionGemma could not load from the local cache. Run the offline model check in desktop/README.md.",
  timeout: "FunctionGemma took too long. The current slide was kept.",
  inference_failure: "FunctionGemma could not make a decision. The current slide was kept.",
  protocol_error: "FunctionGemma returned an invalid decision. The current slide was kept.",
  worker_crashed: "FunctionGemma stopped unexpectedly. The current slide was kept.",
  function_gemma_unavailable: "Slide decisions are unavailable. The current slide was kept."
} as const;

export type PitchFailureCode = keyof typeof SAFE_FAILURE_MESSAGES;

export class PitchModelError extends Error {
  readonly code: PitchFailureCode;

  constructor(code: PitchFailureCode) {
    super(SAFE_FAILURE_MESSAGES[code]);
    this.name = "PitchModelError";
    this.code = code;
  }
}

export function pitchFailureCode(value: unknown): PitchFailureCode {
  return typeof value === "string" && Object.hasOwn(SAFE_FAILURE_MESSAGES, value)
    ? value as PitchFailureCode
    : "function_gemma_unavailable";
}

export function isPitchDecision(value: unknown): value is PitchDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.action === "no_action"
    ? Object.keys(candidate).length === 1
    : candidate.action === "goto_slide"
      && typeof candidate.slide_id === "string"
      && candidate.slide_id.trim().length > 0
      && Object.keys(candidate).length === 2;
}

/** The desktop boundary supplies inference; this layer checks proposals before the controller sees them. */
export function createFunctionGemmaPitchModelAdapter(
  invokeDecision?: (input: PitchModelInput, signal: AbortSignal) => Promise<unknown>
): PitchModelAdapter {
  return {
    async evaluate(input, { signal }) {
      if (signal.aborted) throw new DOMException("Pitch evaluation was cancelled.", "AbortError");
      if (!invokeDecision) throw new PitchModelError("function_gemma_unavailable");
      const decision = await invokeDecision(input, signal);
      if (signal.aborted) throw new DOMException("Pitch evaluation was cancelled.", "AbortError");
      if (!isPitchDecision(decision)) throw new PitchModelError("protocol_error");
      if (decision.action === "goto_slide" && !input.availableSlides.some((slide) => slide.id === decision.slide_id)) {
        throw new PitchModelError("protocol_error");
      }
      return decision;
    }
  };
}
