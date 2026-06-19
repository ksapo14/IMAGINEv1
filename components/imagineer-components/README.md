# Imagineer — Presentation Animation Components

Drop-in React + TypeScript components for the IMAGINEv1 pitch. Each one is a single
self-contained animation for a specific beat in the script. No external libraries —
only React and Tailwind. Every color is inlined (e.g. `bg-[#0A1530]`), so nothing
needs to be added to your `tailwind.config`.

## Install

Copy the `components` folder into your Next.js project (e.g. `src/components`).
That's it.

```tsx
import { LiveWhiteboardDraw } from '@/components';

export default function Slide() {
  return (
    <div className="h-screen w-screen">
      <LiveWhiteboardDraw />
    </div>
  );
}
```

Each component fills its parent (`h-full w-full`), so give it a sized container.

## Notes on integration

- **Next.js App Router**: every animated component starts with `'use client'`, so they
  work inside server components without extra wiring.
- **Triggering**: most animate on mount. Mount the component when its slide becomes
  active (e.g. key it by slide index, or conditionally render it) to replay.
- **Theming**: palette is navy `#0A1530`, marker amber `#F5B546`, live-AI blue `#4CC4F0`.
  Pass `className` to any component to override the background or add layout.
- **Reduced motion**: looping animations respect `prefers-reduced-motion`.

## Component → script map

| Component | Script beat |
|---|---|
| `BoldStatementReveal` | "NOBODY WANTS TO SIT THROUGH 40 SLIDES" headline |
| `LogoGlowUp` | Bad 8-bit logo → clean Imagineer logo |
| `ElectronTransportChain` | The moving electron transport chain |
| `LiveWhiteboardDraw` | Whiteboard drawing live + notes appearing as the speaker talks |
| `SplitScreenContrast` | Old way (wall of text) vs Imagine (idea drawing itself) |
| `ClassroomSpeechBubbles` | Student speech bubbles float up and become sketches |
| `ValueFlywheel` | Focus → understanding → scores → rankings → enrollment → revenue |
| `PricingReveal` | $100 school / $39 teacher pricing cards |
| `ProfitMarginBar` | $7 cost per teacher → ~92% margin |
| `SchoolLogoRain` | Tuition-paying school names falling from the sky |
| `VerticalAdoptionFlow` | Teacher → Department Chair → Principal |
| `PilotExpansionChain` | Pilots + results + case studies = Expansion |
| `TamCounter` | $2.4B TAM (reusable for the 2.15M teachers figure) |
| `CompetitorComparisonTable` | Canva / Slides / ChatGPT vs Imagineer checkmark table |
| `DurhamMapPin` | Map pin drop on Durham, NC |
| `VenueSequence` | Classroom → lecture hall → boardroom → keynote stage |
| `FounderReveal` | Founder photo cards (Vivaan, Jackson, Krish) |
| `LogoTaglineLockup` | Closing logo + tagline lockup |

## Common props

Most components accept content props so you can reuse them with different copy:

- `TamCounter` — `target`, `prefix`, `suffix`, `label`, `decimals`, `aside`
  (e.g. `<TamCounter target={2.15} prefix="" suffix="M" label="Teachers we can reach" />`)
- `LiveWhiteboardDraw` — `bullets`, `title`
- `PricingReveal` — `plans`
- `FounderReveal` — `founders` (pass `photo` URLs to use real headshots)
- `SchoolLogoRain` — `names`
- `ValueFlywheel` / `VerticalAdoptionFlow` / `PilotExpansionChain` / `VenueSequence` —
  pass your own ordered `steps` / `terms` / `venues`

See each file's top comment and prop types for the full list.
