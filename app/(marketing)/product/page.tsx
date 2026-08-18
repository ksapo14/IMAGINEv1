import type { Metadata } from "next";
import Link from "next/link";
import {
  MarketingDiagramPreview,
  recallDiagram
} from "@/components/marketing/diagram-previews";
import { productWorkflow, visualForms } from "@/components/marketing/evidence";
import { SectionHeading } from "@/components/marketing/visual-language";

export const metadata: Metadata = {
  title: "Product",
  description:
    "The verified Imagine workflow for prepared diagrams, live visual notes, and exact-phrase recall."
};

export default function ProductPage() {
  return (
    <main id="main-content">
      <section className="marketing-shell marketing-page-hero">
        <div>
          <p className="marketing-eyebrow" data-hero>
            Product
          </p>
          <h1 data-hero>One canvas for prepared and live teaching moments.</h1>
        </div>
        <p className="marketing-page-hero-note" data-hero>
          The current workspace combines a browser-local lesson library with a
          live canvas. Prepared recall and live generation share the teaching
          surface without becoming the same action.
        </p>
      </section>

      <section className="marketing-shell marketing-section">
        <SectionHeading
          eyebrow="Verified workflow"
          title="A deliberate path from preparation to recall."
        />
        <div className="marketing-workflow">
          {productWorkflow.map((step) => (
            <article key={step.index} data-reveal>
              <span className="marketing-index">{step.index}</span>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="marketing-technical-band">
        <div className="marketing-shell marketing-technical-grid">
          <div data-reveal>
            <p className="marketing-eyebrow">Exact recall</p>
            <h2>Imagine, show me &lt;phrase&gt;</h2>
            <p>
              A complete exact-match command reveals the corresponding stored
              diagram without a generation request. Other inputs beginning with
              the whole word “Imagine” are handled locally instead of falling
              through to live generation.
            </p>
          </div>
          <MarketingDiagramPreview
            diagram={recallDiagram}
            alt="Tree preview of a stored cellular energy diagram organized into inputs, process, and outputs."
            compact
            parallax
          />
        </div>
      </section>

      <section className="marketing-shell marketing-section marketing-product-forms">
        <SectionHeading
          eyebrow="Five visual forms"
          title="The model supplies structure. Trusted components render it."
        />
        <ol className="marketing-form-ledger" data-reveal>
          {visualForms.map((form, index) => (
            <li key={form.name}>
              <span>0{index + 1}</span>
              <strong>{form.name}</strong>
              <p>{form.use}</p>
            </li>
          ))}
        </ol>
        <aside className="marketing-storage-note" data-reveal>
          <span>Current storage</span>
          <p>
            Prepared lesson records live in this browser’s local storage today.
            Cloud storage is future work, not a current product capability.
          </p>
        </aside>
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
