import type { Metadata } from "next";
import {
  educatorControlDiagram,
  MarketingDiagramPreview
} from "@/components/marketing/diagram-previews";
import { educatorJobs } from "@/components/marketing/evidence";
import { DiagramMotif, SectionHeading } from "@/components/marketing/visual-language";

export const metadata: Metadata = {
  title: "Educators",
  description:
    "How Imagine is designed to support educator control across planned and live classroom visuals."
};

const designedBenefits = [
  "Designed to keep the educator in control of when a prepared diagram appears.",
  "Designed to support a spoken explanation without requiring a slide change.",
  "Designed to keep planned recall separate from live generation.",
  "Designed to make the current visual state visible before the next turn."
];

export default function EducatorsPage() {
  return (
    <main id="main-content">
      <section className="marketing-shell marketing-page-hero educator-hero">
        <div>
          <p className="marketing-eyebrow" data-hero>
            Educators
          </p>
          <h1 data-hero>The lesson stays yours.</h1>
        </div>
        <div className="marketing-page-hero-note" data-hero>
          <p>
            Imagine is designed to support the explanation already happening in
            the room—not to choose the lesson, replace educator judgment, or
            decide when a stored visual should appear.
          </p>
        </div>
      </section>

      <section className="marketing-shell marketing-section educator-jobs">
        <SectionHeading
          eyebrow="Classroom jobs"
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
            <p className="marketing-eyebrow">Educator control</p>
            <h2>Prepared visuals wait for a complete recall command.</h2>
            <p>
              A saved diagram appears only after its exact phrase is called.
              Ordinary teaching speech continues through the live notes and
              visuals workflow.
            </p>
          </div>
          <div className="marketing-control-media" data-reveal>
            <div className="marketing-command-sample">
              <span>stored phrase</span>
              <strong>cellular energy pathway</strong>
              <code>Imagine, show me cellular energy pathway</code>
            </div>
            <MarketingDiagramPreview
              diagram={educatorControlDiagram}
              alt="Flowchart preview separating finalized teaching speech from an exact prepared-recall command."
              compact
            />
          </div>
        </div>
      </section>

      <section className="marketing-shell marketing-section">
        <SectionHeading
          eyebrow="Design intent"
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
