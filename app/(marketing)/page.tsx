import Image from "next/image";
import Link from "next/link";
import { visualForms } from "@/components/marketing/evidence";
import { ProductModeAccordion } from "@/components/marketing/product-mode-accordion";
import {
  DiagramMotif,
  SectionHeading
} from "@/components/marketing/visual-language";

export default function HomePage() {
  return (
    <main id="main-content">
      <section className="marketing-shell marketing-hero marketing-hero-with-photo">
        <div className="marketing-hero-copy">
          <p className="marketing-eyebrow" data-hero>
            Classroom visual workspace
          </p>
          <h1 data-hero>Keep teaching. Let the picture take shape.</h1>
          <p className="marketing-hero-lede" data-hero>
            Prepare the diagrams you know you will need. Build visual notes for
            the moments you did not plan. Recall stored visuals with a deliberate
            phrase.
          </p>
          <div className="marketing-actions" data-hero>
            <Link href="/product" className="marketing-primary-link">
              See the product <span aria-hidden="true">↗</span>
            </Link>
            <Link href="/educators" className="marketing-text-link">
              For educators <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        <figure
          className="marketing-hero-photo"
          data-hero
          data-parallax-media
        >
          <Image
            src="/media/imagine-founders-showcase.jpg"
            alt="The three Imagine founders presenting together in a lecture hall."
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 34vw"
            style={{ objectPosition: "26.7% 38.5%" }}
          />
          <figcaption>Imagine presentation · classroom origin</figcaption>
        </figure>
      </section>

      <section
        className="marketing-visual-marquee"
        aria-label="Visual forms and classroom actions"
      >
        <p className="marketing-sr-only">
          Flowcharts for processes. Trees for hierarchy. Venn diagrams for
          comparison. Pie charts for parts of a whole. Mind maps for
          relationships. Prepare, teach live, and recall intentionally.
        </p>
        <div className="marketing-visual-marquee-track" aria-hidden="true">
          {[0, 1].map((copy) => (
            <div key={copy}>
              <span>Flowchart · process</span>
              <span>Tree · hierarchy</span>
              <span>Venn · comparison</span>
              <span>Pie · parts of a whole</span>
              <span>Mind map · relationships</span>
              <span>Prepare · Live · Recall</span>
            </div>
          ))}
        </div>
      </section>

      <section
        className="marketing-shell marketing-section marketing-product-story"
        data-product-story
      >
        <div data-product-story-copy>
          <SectionHeading
            eyebrow="How it reads in the room"
            title="From spoken explanation to a useful visual."
            body="These product previews illustrate the current prepared, live, and intentional-recall workflow. They are not a live classroom recording."
          />
        </div>
        <div data-product-story-pin>
          <ProductModeAccordion />
        </div>
      </section>

      <section className="marketing-pattern-band">
        <div className="marketing-shell marketing-pattern-grid">
          <SectionHeading
            eyebrow="Trusted forms"
            title="Classroom ideas need different shapes."
          />
          <div className="marketing-pattern-list" data-reveal>
            {visualForms.map((form, index) => (
              <div key={form.name}>
                <span>0{index + 1}</span>
                <strong>{form.name}</strong>
                <p>{form.use}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-shell marketing-closing" data-reveal>
        <DiagramMotif />
        <p className="marketing-eyebrow">Continue exploring</p>
        <h2>See what happens before class and while the lesson is live.</h2>
        <div className="marketing-actions">
          <Link href="/product" className="marketing-primary-link">
            Product workflow <span aria-hidden="true">↗</span>
          </Link>
          <Link href="/educators" className="marketing-text-link">
            Educator view <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
