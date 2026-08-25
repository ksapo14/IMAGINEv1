import type { Metadata } from "next";
import Link from "next/link";
import { MarketingScenePreview } from "@/components/marketing/diagram-previews";
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
          <h1 data-hero>Evaluate the workflow in the context that matters.</h1>
        </div>
        <p className="marketing-page-hero-note" data-hero>
          Invitation-only pilots are structured opportunities to learn how the
          current product fits a school’s classrooms. They are not claims of
          established impact, adoption, or guaranteed student outcomes.
        </p>
      </section>

      <section className="marketing-shell marketing-section schools-measures">
        <SectionHeading
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
            <h2>Keep the comprehension signal local to the pilot.</h2>
            <p>
              The participating school selects the comprehension signal it
              considers appropriate. Context-entry effort, usability, scene
              decision reliability, and lesson continuity are reviewed alongside
              it rather than used as a substitute for it.
            </p>
          </div>
          <MarketingScenePreview
            src="/media/diagrams/pilot-review-flow.png"
            alt="Editorial diagram connecting educator experience and school-selected evidence to a pilot review."
            compact
          />
        </div>
      </section>

      <section className="marketing-shell marketing-closing" data-reveal>
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
