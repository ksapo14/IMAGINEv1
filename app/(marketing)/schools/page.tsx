import type { Metadata } from "next";
import Link from "next/link";
import {
  MarketingDiagramPreview,
  pilotDiagram
} from "@/components/marketing/diagram-previews";
import { pilotMeasures } from "@/components/marketing/evidence";
import { SectionHeading } from "@/components/marketing/visual-language";

export const metadata: Metadata = {
  title: "Schools",
  description:
    "An invitation-only school pilot framework focused on usability, reliability, continuity, and locally selected measures."
};

export default function SchoolsPage() {
  return (
    <main id="main-content">
      <section className="marketing-shell marketing-page-hero schools-hero">
        <div>
          <p className="marketing-eyebrow" data-hero>
            Invitation-only pilots
          </p>
          <h1 data-hero>Evaluate the workflow in the context that matters.</h1>
        </div>
        <p className="marketing-page-hero-note" data-hero>
          A pilot is a structured opportunity to learn how the current product
          fits a school’s classrooms. It is not a claim of established impact,
          adoption, or guaranteed student outcomes.
        </p>
      </section>

      <section className="marketing-shell marketing-section schools-measures">
        <SectionHeading
          eyebrow="Pilot framework"
          title="Measure the product before making broader claims."
        />
        <ol data-reveal>
          {pilotMeasures.map((measure, index) => (
            <li key={measure}>
              <span>0{index + 1}</span>
              <strong>{measure}</strong>
            </li>
          ))}
        </ol>
      </section>

      <section className="marketing-technical-band">
        <div className="marketing-shell marketing-technical-grid">
          <div data-reveal>
            <p className="marketing-eyebrow">School-selected evidence</p>
            <h2>Keep the comprehension signal local to the pilot.</h2>
            <p>
              The participating school selects the comprehension signal it
              considers appropriate. Prep effort, usability, recall reliability,
              and lesson continuity are reviewed alongside it rather than used as
              a substitute for it.
            </p>
          </div>
          <MarketingDiagramPreview
            diagram={pilotDiagram}
            alt="Mind map preview connecting a school pilot review to preparation effort, usability, recall, continuity, and a local signal."
            compact
          />
        </div>
      </section>

      <section className="marketing-shell marketing-closing" data-reveal>
        <p className="marketing-eyebrow">Background</p>
        <h2>Review the current product and the motivation behind it.</h2>
        <div className="marketing-actions">
          <Link href="/product" className="marketing-primary-link">
            Current product <span aria-hidden="true">↗</span>
          </Link>
          <Link href="/about" className="marketing-text-link">
            About Imagine <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
