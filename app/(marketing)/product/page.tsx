import type { Metadata } from "next";
import Link from "next/link";
import {
  cumulativeBoardScene,
  MarketingScenePreview
} from "@/components/marketing/diagram-previews";
import { productWorkflow, sceneCapabilities } from "@/components/marketing/evidence";
import { SectionHeading } from "@/components/marketing/visual-language";

export const metadata: Metadata = {
  title: "Product",
  description:
    "The verified Imagine workflow for saved lesson context and a cumulative live StickScene whiteboard."
};

export default function ProductPage() {
  return (
    <main id="main-content">
      <section className="marketing-shell marketing-page-hero">
        <div>
          <p className="marketing-eyebrow" data-hero>
            Imaginev1
          </p>
          <h1 data-hero>One whiteboard that develops with the lesson.</h1>
        </div>
        <p className="marketing-page-hero-note" data-hero>
          Save lesson context in the browser before class. During class, each
          finalized teaching turn is considered alongside that context and the
          board that is already visible.
        </p>
      </section>

      <section className="marketing-shell marketing-section">
        <SectionHeading
          eyebrow="Verified workflow"
          title="A deliberate path from context to cumulative scenes."
        />
        <ol
          className="marketing-workflow"
          aria-label="Imaginev1 product workflow"
          data-product-flow
        >
          {productWorkflow.map((step) => (
            <li key={step.index} data-product-flow-step>
              <span className="marketing-index">{step.index}</span>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="marketing-technical-band">
        <div className="marketing-shell marketing-technical-grid">
          <div data-reveal>
            <p className="marketing-eyebrow">Cumulative board</p>
            <h2>Create or update.</h2>
            <p>
              The Visual Director makes one atomic decision for each processed
              live turn. New scenes receive deterministic, non-overlapping
              placement; related scenes update without moving.
            </p>
          </div>
          <MarketingScenePreview
            scene={cumulativeBoardScene}
            alt="Stick-scene preview showing an earlier idea, an updated idea, and a new idea connected on one cumulative board."
            compact
            parallax
          />
        </div>
      </section>

      <section className="marketing-shell marketing-section marketing-product-forms">
        <SectionHeading
          eyebrow="Five scene capabilities"
          title="The director supplies typed data. Trusted components render it."
        />
        <ol className="marketing-form-ledger" data-reveal>
          {sceneCapabilities.map((capability, index) => (
            <li key={capability.name}>
              <span>0{index + 1}</span>
              <strong>{capability.name}</strong>
              <p>{capability.use}</p>
            </li>
          ))}
        </ol>
        <aside className="marketing-storage-note" data-reveal>
          <span>Current storage</span>
          <p>
            Lesson context records live in this browser’s local storage today.
            The cumulative live board is session state; cloud storage is not a
            current product capability.
          </p>
        </aside>
      </section>

      <section
        className="marketing-shell marketing-section marketing-demo"
        aria-labelledby="product-demo-title"
      >
        <div data-reveal>
          <p className="marketing-eyebrow">Demo</p>
          <p className="marketing-demo-status">Coming Soon</p>
        </div>
        <div data-reveal>
          <h2 id="product-demo-title">See Imaginev1 develop with a lesson.</h2>
          <p>
            The public demo is still being prepared. Teachers interested in beta
            testing can contact the founding team directly.
          </p>
          <Link href="/contact" className="marketing-primary-link">
            Contact the team <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <section className="marketing-shell marketing-closing" data-reveal>
        <p className="marketing-eyebrow">Choose a perspective</p>
        <h2>Explore the classroom workflow or the school pilot framework.</h2>
        <div className="marketing-actions">
          <Link href="/educators" className="marketing-primary-link">
            For educators <span aria-hidden="true">↗</span>
          </Link>
          <Link href="/schools" className="marketing-text-link">
            For schools <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
