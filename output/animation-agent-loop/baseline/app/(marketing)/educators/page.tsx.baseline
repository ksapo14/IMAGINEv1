import type { Metadata } from "next";
import { MarketingScenePreview } from "@/components/marketing/diagram-previews";
import { educatorJobs } from "@/components/marketing/evidence";
import { DiagramMotif, SectionHeading } from "@/components/marketing/visual-language";

export const metadata: Metadata = {
  title: "Educators",
  description:
    "How Imagine uses saved lesson context and finalized speech to support a cumulative classroom whiteboard."
};

const designedBenefits = [
  "Designed to ground each decision in context the educator saved before class.",
  "Designed to react only after a spoken teaching turn is finalized.",
  "Designed to preserve useful earlier scenes while the explanation continues.",
  "Designed to make the current board state visible before the next turn."
];

export default function EducatorsPage() {
  return (
    <main id="main-content">
      <section className="marketing-shell marketing-page-hero educator-hero">
        <div>
          <h1 data-hero>The lesson stays yours.</h1>
        </div>
        <div className="marketing-page-hero-note" data-hero>
          <p>
            Imagine is designed to support the explanation already happening in
            the room—not to choose the lesson, replace educator judgment, or
            decide what the class should learn.
          </p>
        </div>
      </section>

      <section className="marketing-shell marketing-section educator-jobs">
        <SectionHeading
          title="Use a visual when the idea calls for one."
        />
        <ol data-reveal>
          {educatorJobs.map((job, index) => (
            <li key={job}>
              <span>0{index + 1}</span>
              <strong>{job}</strong>
            </li>
          ))}
        </ol>
      </section>

      <section className="marketing-control-section">
        <div className="marketing-shell marketing-control-grid">
          <div data-reveal>
            <h2>The current explanation guides the next board decision.</h2>
            <p>
              Imagine waits for finalized speech, then interprets it with the
              saved lesson context and current board. It creates a new scene or
              updates a related scene in its original position.
            </p>
          </div>
          <div className="marketing-control-media" data-reveal>
            <div className="marketing-command-sample">
              <span>finalized teaching turn</span>
              <strong>oxygen helps the cell release usable energy</strong>
              <code>lesson context + current board</code>
            </div>
            <MarketingScenePreview
              src="/media/diagrams/respiration-update.png"
              alt="Editorial diagram of an educator explaining how oxygen contributes to cellular respiration and ATP."
              compact
            />
          </div>
        </div>
      </section>

      <section className="marketing-shell marketing-section">
        <SectionHeading
          title="Support the flow without making promises about outcomes."
        />
        <div className="marketing-benefit-lines">
          {designedBenefits.map((benefit) => (
            <p key={benefit} data-reveal>
              {benefit}
            </p>
          ))}
        </div>
        <DiagramMotif />
      </section>
    </main>
  );
}
