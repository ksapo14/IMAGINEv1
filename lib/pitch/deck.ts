import type { PitchSlideDefinition, SlideDescriptor, SlideId } from "./types.ts";

export const PITCH_DECK_ID = "imagineer-pitch-carl";
export const PITCH_DECK_VERSION = 1;
export const PITCH_START_SLIDE_ID = "open";

/**
 * The deck's model-facing copy lives beside its matching hints, while slide
 * renderers remain independent in the presentation component layer.
 */
export const PITCH_SLIDES: readonly PitchSlideDefinition[] = [
  { id: "open", title: "Imagineer", description: "Imagineer introduction and founders Vivaan Grover, Jackson Bizzell, and Krish Sapovadia.", matching: { phrases: ["welcome to imagineer", "introduce imagineer"], keywords: ["imagineer", "founders"] } },
  { id: "anecdote", title: "The story", description: "AP Biology experience with the hard-to-picture electron transport chain.", matching: { phrases: ["electron transport chain", "ap biology classroom"], keywords: ["biology", "electron", "transport"] } },
  { id: "problem", title: "The problem", description: "Invisible concepts, teacher preparation time, and explanation gaps in class.", matching: { phrases: ["invisible concepts", "teacher preparation time"], keywords: ["invisible", "preparation", "explanation"] } },
  { id: "hall", title: "In the hall", description: "Live visual explanations used across classrooms and school subjects.", matching: { phrases: ["across classrooms", "live visual explanations"], keywords: ["classrooms", "subjects", "hallway"] } },
  { id: "whynow", title: "Why now", description: "New technology capabilities and costs make the product possible now.", matching: { phrases: ["why now", "technology costs"], keywords: ["capabilities", "costs", "technology"] } },
  { id: "product", title: "The product", description: "The product pipeline, agent responsibilities, and visual output formats.", matching: { phrases: ["product pipeline", "agent responsibilities"], keywords: ["pipeline", "agents", "formats"] } },
  { id: "demo", title: "Demo", description: "Transition from the product explanation into a live product demonstration.", matching: { phrases: ["live product demonstration", "show you the demo"], keywords: ["demo", "demonstration"] } },
  { id: "value", title: "Classroom value", description: "Attention, engagement, and clearer classroom explanations for learners.", matching: { phrases: ["classroom attention", "student engagement"], keywords: ["attention", "engagement", "learners"] } },
  { id: "competition", title: "Competition", description: "Competitors and Imagineer's distinct position in the education market.", matching: { phrases: ["competitive landscape", "our competitors"], keywords: ["competition", "competitors", "positioning"] } },
  { id: "gtm", title: "Go to market", description: "Private-school entry, teacher referrals, and classroom-by-classroom expansion.", matching: { phrases: ["teacher next door", "private school entry"], keywords: ["referrals", "entry", "expansion"] } },
  { id: "tam", title: "Market opportunity", description: "Market size, North Carolina launch area, geographic expansion, and pricing basis.", matching: { phrases: ["private school market", "north carolina market"], keywords: ["market", "carolina", "geographic"] } },
  { id: "model", title: "Business model", description: "Teacher and school plans, recurring revenue, and delivery costs.", matching: { phrases: ["teacher and school plans", "delivery costs"], keywords: ["plans", "revenue", "delivery"] } },
  { id: "financials", title: "Financials", description: "Funding allocation and three-year financial projections.", matching: { phrases: ["three year financial projection", "funding allocation"], keywords: ["financial", "projection", "allocation"] } },
  { id: "whyus", title: "Why us", description: "Founders' relevant experience, personal motivation, and ability to execute.", matching: { phrases: ["why us", "founder experience"], keywords: ["experience", "motivation", "execute"] } },
  { id: "supports", title: "Supporters", description: "Supporters, advisors, and prospective classroom testers.", matching: { phrases: ["prospective testers", "our supporters"], keywords: ["supporters", "advisors", "testers"] } },
  { id: "roadmap", title: "Roadmap", description: "Development, beta testing, and launch milestones.", matching: { phrases: ["beta testing", "launch milestones"], keywords: ["roadmap", "beta", "launch"] } },
  { id: "vision", title: "Vision", description: "Longer-term applications for Imagineer beyond classrooms.", matching: { phrases: ["beyond classrooms", "long term vision"], keywords: ["vision", "longer", "applications"] } },
  { id: "ask", title: "The ask", description: "Request for advice, next-step feedback, and venture introductions.", matching: { phrases: ["venture introductions", "ask for advice"], keywords: ["advice", "feedback", "introductions"] } }
];

export const PITCH_DECK: readonly SlideDescriptor[] = PITCH_SLIDES.map(({ id, title, description }) => ({
  id,
  title,
  description
}));

function isValidId(value: string) {
  return /^[a-z0-9][a-z0-9_-]*$/.test(value);
}

/** Reject invalid metadata before it can create unreachable presentation state. */
export function assertValidPitchDeck(slides: readonly SlideDescriptor[]) {
  if (!slides.length) throw new Error("A pitch deck needs at least one slide.");
  const ids = new Set<string>();
  for (const slide of slides) {
    if (!isValidId(slide.id) || ids.has(slide.id)) {
      throw new Error(`Pitch deck contains an invalid or duplicate slide ID: ${slide.id}`);
    }
    if (!slide.title.trim() || !slide.description.trim()) {
      throw new Error(`Pitch slide ${slide.id} needs a title and description.`);
    }
    ids.add(slide.id);
  }
}

/** UI renderers call this once to ensure model-addressable slides all have a view. */
export function validatePitchRendererIds(rendererIds: Iterable<SlideId>, deck = PITCH_DECK) {
  const ids = new Set(rendererIds);
  const expected = new Set(deck.map((slide) => slide.id));
  return deck.every((slide) => ids.has(slide.id)) && [...ids].every((id) => expected.has(id));
}

export function getPitchSlide(slideId: SlideId, deck = PITCH_DECK) {
  return deck.find((slide) => slide.id === slideId) ?? null;
}

assertValidPitchDeck(PITCH_DECK);
