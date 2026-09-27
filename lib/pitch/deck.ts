import type { SlideDescriptor, SlideId } from "./types.ts";

export const PITCH_DECK_ID = "imagineer-pitch-carl";
export const PITCH_DECK_VERSION = 1;
export const PITCH_START_SLIDE_ID = "open";

/** Each description becomes the selection guidance for that slide's model function. */
export const PITCH_SLIDES: readonly SlideDescriptor[] = [
  { id: "open", title: "Imagineer", description: "Opening and introduction to Imagineer and founders Vivaan Grover, Jackson Bizzell, and Krish Sapovadia. Choose for an explicit request to start over, introduce the company or team, or return to the title slide." },
  { id: "anecdote", title: "The story", description: "The founders' AP Biology story about struggling to picture the electron transport chain. Choose when the speaker introduces the personal classroom anecdote, biology example, or what inspired Imagineer." },
  { id: "problem", title: "The problem", description: "The classroom problem: invisible or abstract concepts are hard to explain, teachers spend time preparing visuals, and students can miss the explanation. Choose for the pain point, teaching gap, or why existing classroom explanations fall short." },
  { id: "hall", title: "In the hall", description: "Imagineer used for live visual explanations across classrooms and school subjects. Choose for the hallway or classroom scenario, teachers using it across subjects, or showing how an explanation reaches students in the moment." },
  { id: "whynow", title: "Why now", description: "Why this is possible now: advances in AI generation and falling technology costs. Choose for timing, recent technical capability, affordability, or why the product could not be built the same way earlier." },
  { id: "product", title: "The product", description: "How Imagineer works: the product pipeline, agent responsibilities, and generated visual formats. Choose for an explanation of the system, workflow, agents, inputs and outputs, or the product itself before a live demonstration." },
  { id: "demo", title: "Demo", description: "Transition into a live demonstration of Imagineer. Choose for an explicit request to see the product in action, run the demo, or move from describing the product to showing it." },
  { id: "value", title: "Classroom value", description: "Benefits in class: stronger attention and engagement and clearer explanations for learners. Choose when discussing student understanding, classroom impact, learning value, or the benefit to teachers and students." },
  { id: "competition", title: "Competition", description: "Competitors and Imagineer's distinct position in the education market. Choose for alternatives, competing tools, differentiation, comparisons, or why a school would choose Imagineer over another product." },
  { id: "gtm", title: "Go to market", description: "The go-to-market and customer acquisition strategy: start with private schools, grow through teacher referrals, and expand classroom by classroom. Choose for sales, distribution, reaching schools, finding early customers, or a plan to spread adoption. This is about who adopts the product and how, not the product build schedule." },
  { id: "tam", title: "Market opportunity", description: "Market size and expansion: North Carolina launch area, broader geography, and the pricing basis used to estimate opportunity. Choose for TAM, addressable market, market sizing, geographic reach, or how large the opportunity could become." },
  { id: "model", title: "Business model", description: "How Imagineer makes money: teacher and school plans, recurring revenue, and delivery costs. Choose for subscriptions, pricing plans, who pays, revenue model, unit economics, or cost to serve; use the financials slide for projections and funding use." },
  { id: "financials", title: "Financials", description: "Funding allocation and three-year financial projections. Choose for forecast revenue or expenses, projected growth, cash needs, budgets, funding use, or the numbers over the next three years." },
  { id: "whyus", title: "Why us", description: "Why this founding team can execute: relevant experience, personal motivation, and ability to build Imagineer. Choose for founder qualifications, team fit, background, credibility, or why these founders are the right people." },
  { id: "supports", title: "Supporters", description: "People supporting Imagineer: supporters, advisors, and prospective classroom testers. Choose for mentors, external validation, advisory help, early school contacts, or teachers willing to test." },
  { id: "roadmap", title: "Roadmap", description: "The product development timeline: build milestones, beta testing, and launch dates. Choose for what will be built next, testing schedule, release phases, or when Imagineer will launch. Do not choose for go-to-market, sales, private-school entry, or teacher referrals." },
  { id: "vision", title: "Vision", description: "Longer-term possibilities for Imagineer beyond classrooms. Choose for future applications, broader vision, long-term direction, or where the technology could go after the initial education use case." },
  { id: "ask", title: "The ask", description: "The closing request for advice, next-step feedback, and venture introductions. Choose when wrapping up with what the team wants from the audience, requests for introductions, feedback, support, or a final call to action." }
];

export const PITCH_DECK: readonly SlideDescriptor[] = PITCH_SLIDES;

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
