import Image from "next/image";
import Link from "next/link";
import { sceneCapabilities } from "@/components/marketing/evidence";
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
          <h1 data-hero>Imaginer</h1>
          <p className="marketing-mission" data-hero>
            Revolutionizing the way people explain things
          </p>
          <p className="marketing-hero-lede" data-hero>
            <strong>Keep teaching. Let the picture take shape.</strong>{" "}
            Save the lesson context before class. As you teach, finalized speech
            becomes a cumulative whiteboard of simple scenes that can stay,
            appear, or update in place.
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
        aria-label="Whiteboard decisions and classroom actions"
      >
        <p className="marketing-sr-only">
          Create a scene for a new idea. Update a related scene in place.
          Connect concepts as the lesson grows.
        </p>
        <div className="marketing-visual-marquee-track" aria-hidden="true">
          {[0, 1].map((copy) => (
            <div key={copy}>
              <span>Create · add an idea</span>
              <span>Update · deepen a concept</span>
              <span>Connect · show relationships</span>
              <span>Place · avoid overlap</span>
              <span>Context · Speech · Board</span>
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
            body="Illustrative product walkthrough — non-interactive. These previews show lesson context and cumulative live scenes, not a classroom recording."
          />
        </div>
        <div data-product-story-pin>
          <ProductModeAccordion />
        </div>
      </section>

      <section className="marketing-pattern-band">
        <div className="marketing-shell marketing-pattern-grid">
          <SectionHeading
            eyebrow="Board decisions"
            title="Each turn changes only what the explanation needs."
          />
          <div className="marketing-pattern-list" data-reveal>
            {sceneCapabilities.map((capability, index) => (
              <div key={capability.name}>
                <span>0{index + 1}</span>
                <strong>{capability.name}</strong>
                <p>{capability.use}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-shell marketing-closing" data-reveal>
        <DiagramMotif />
        <p className="marketing-eyebrow">Continue exploring</p>
        <h2>See how lesson context becomes a cumulative live whiteboard.</h2>
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
