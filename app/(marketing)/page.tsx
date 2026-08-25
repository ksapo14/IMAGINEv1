import Image from "next/image";
import Link from "next/link";
import { MarketingScenePreview } from "@/components/marketing/diagram-previews";
import {
  DiagramMotif,
  SectionHeading
} from "@/components/marketing/visual-language";

const productModes = [
  {
    title: "Context",
    body: "Save the lesson context before class so live turns stay grounded.",
    src: "/media/diagrams/lesson-context-flow.png",
    alt: "Editorial diagram connecting saved lesson context and finalized speech to the live board."
  },
  {
    title: "Live",
    body: "Let finalized speech create a useful scene when the explanation calls for one.",
    src: "/media/diagrams/cellular-energy-flow.png",
    alt: "Editorial diagram showing cellular energy moving from glucose through a cell to ATP."
  },
  {
    title: "Cumulative",
    body: "Keep earlier scenes while related ideas are updated and new ones are placed.",
    src: "/media/diagrams/cumulative-board-flow.png",
    alt: "Editorial diagram connecting an earlier idea, an updated idea, and a new idea on one board."
  }
] as const;

export default function HomePage() {
  return (
    <main id="main-content">
      <section className="marketing-shell marketing-hero marketing-hero-with-photo marketing-home-hero">
        <div className="marketing-hero-copy">
          <h1>Imaginer</h1>
          <p className="marketing-mission">
            Revolutionizing the way people explain things
          </p>
          <p className="marketing-hero-lede">
            <strong>Keep teaching. Let the picture take shape.</strong>{" "}
            Save the lesson context before class. As you teach, finalized speech
            becomes a cumulative whiteboard of simple scenes that can stay,
            appear, or update in place.
          </p>
          <div className="marketing-actions">
            <Link href="/product" className="marketing-primary-link">
              See the product <span aria-hidden="true">↗</span>
            </Link>
            <Link href="/educators" className="marketing-text-link">
              For educators <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        <figure className="marketing-hero-photo">
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

      <section className="marketing-shell marketing-section marketing-home-story">
        <SectionHeading
          title="Context, live teaching, and one cumulative board."
          body="These editorial diagrams illustrate lesson context and cumulative live scenes. They are static examples, not a classroom recording or interactive demo."
        />
        <ol className="marketing-home-mode-grid">
          {productModes.map((mode, index) => (
            <li key={mode.title}>
              <article>
                <div className="marketing-home-mode-copy">
                  <span>0{index + 1}</span>
                  <h3>{mode.title}</h3>
                  <p>{mode.body}</p>
                </div>
                <MarketingScenePreview src={mode.src} alt={mode.alt} />
              </article>
            </li>
          ))}
        </ol>
      </section>

      <section className="marketing-shell marketing-closing" data-reveal>
        <DiagramMotif />
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
