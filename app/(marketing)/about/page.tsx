import type { Metadata } from "next";
import Image from "next/image";
import { DiagramMotif, SectionHeading } from "@/components/marketing/visual-language";

export const metadata: Metadata = {
  title: "About",
  description:
    "The AP Biology classroom motivation behind Imagine, the founding team, and the distinction between today’s product and future directions."
};

const team = [
  {
    name: "Vivaan Grover",
    role: "CEO",
    initials: "VG",
    photo: "/media/vivaan-portrait.jpg",
    focus: "34.9% 31.1%",
    alt: "Vivaan Grover wearing a white suit beside a canal."
  },
  {
    name: "Jackson Bizell",
    role: "CFO",
    initials: "JB",
    photo: "/media/jackson-portrait.jpg",
    focus: "38.7% 31.7%",
    alt: "Jackson Bizell wearing a dark suit in a museum."
  },
  {
    name: "Krish Sapovadia",
    role: "CTO",
    initials: "KS",
    photo: "/media/krish-portrait.jpg",
    focus: "23% 37.3%",
    alt: "Krish Sapovadia smiling at a mountain overlook."
  }
];

export default function AboutPage() {
  return (
    <main id="main-content">
      <section className="marketing-shell marketing-page-hero about-hero">
        <div>
          <p className="marketing-eyebrow" data-hero>
            Origin
          </p>
          <h1 data-hero>A classroom question worth making visible.</h1>
        </div>
        <p className="marketing-page-hero-note" data-hero>
          Imagine began with a founder’s AP Biology experience: some explanations
          became much easier to follow once their relationships were visible.
          The motivating question was simple—could the visual keep pace with the
          explanation?
        </p>
      </section>

      <section className="marketing-shell marketing-section about-story">
        <SectionHeading
          eyebrow="Founder motivation"
          title="Build for the moment an idea needs a shape."
          body="That classroom experience is the origin story. It is not presented as a formal study or evidence of a guaranteed learning outcome."
        />
        <blockquote data-reveal>
          “What if the teacher could keep talking, and the visual could develop
          alongside the explanation?”
        </blockquote>
      </section>

      <section className="marketing-team-band">
        <div className="marketing-shell">
          <SectionHeading eyebrow="Team" title="Three roles. One current product." />
          <div className="marketing-team-list">
            {team.map((member, index) => (
              <article key={member.name} data-reveal>
                <figure>
                  <Image
                    src={member.photo}
                    alt={member.alt}
                    fill
                    sizes="(max-width: 720px) 100vw, 33vw"
                    style={{ objectPosition: member.focus }}
                  />
                </figure>
                <div className="marketing-team-meta">
                  <span>{member.initials}</span>
                  <p>0{index + 1}</p>
                  <h2>{member.name}</h2>
                  <strong>{member.role}</strong>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-shell marketing-section direction-section">
        <div className="direction-current" data-reveal>
          <p className="marketing-eyebrow">Current product</p>
          <h2>A browser-local educator workspace.</h2>
          <p>
            Today, Imagine prepares three to five diagrams, streams live notes and
            visuals from finalized speech, and recalls stored diagrams by exact
            phrase.
          </p>
        </div>
        <div className="direction-future" data-reveal>
          <p className="marketing-eyebrow">Future direction</p>
          <h2>Other rooms may come later.</h2>
          <p>
            Lecture halls, boardrooms, and keynote stages are directions the team
            may explore. They are not current product surfaces or availability
            claims.
          </p>
          <DiagramMotif variant="orbit" />
        </div>
      </section>
    </main>
  );
}
