import type { CompositionBlock } from "@/components/workspace/types";

/**
 * Builds readable summary bullets from the same composition blocks shown on
 * the canvas. Structured items are preferred, with body and title as fallbacks.
 */
export function deriveCompositionSummary(
  blocks: readonly CompositionBlock[]
): string[] {
  const bullets = blocks.flatMap((block) => {
    const items = block.items.map((item) => item.trim()).filter(Boolean);
    if (items.length > 0) {
      return items;
    }

    const fallback = block.body.trim() || block.title.trim();
    return fallback ? [fallback] : [];
  });

  return bullets.filter((bullet, index) => bullets.indexOf(bullet) === index);
}
