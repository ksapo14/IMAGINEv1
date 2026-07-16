"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import {
  ArrowDown,
  ArrowRight,
  AudioLines,
  Building2,
  Check,
  CircleDollarSign,
  GitCompareArrows,
  GraduationCap,
  Layers3,
  MapPin,
  Minus,
  Presentation,
  School,
  Sparkles,
  Users,
  WandSparkles
} from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Button } from "@/components/ui/button";
import { KnowledgeScene } from "@/components/knowledge-scene";
import { LaunchLoader } from "@/components/launch-loader";
import { SmoothScroll } from "@/components/smooth-scroll";
import { ThemeToggle } from "@/components/theme-toggle";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const chapters = [
  {
    verb: "Listen",
    title: "The teacher speaks naturally.",
    body: "Imagine captures the explanation without interrupting the teacher-to-student connection.",
    icon: AudioLines,
    tone: "chapter-lime",
    visual: "listen"
  },
  {
    verb: "Understand",
    title: "The system finds the idea inside it.",
    body: "A layered voice, language, and visual stack identifies sequence, contrast, hierarchy, and relationships.",
    icon: Layers3,
    tone: "chapter-cobalt",
    visual: "understand"
  },
  {
    verb: "Draw",
    title: "The picture builds in the room.",
    body: "Notes, diagrams, comparisons, and visual models appear the second the idea is spoken.",
    icon: WandSparkles,
    tone: "chapter-paper",
    visual: "draw"
  },
  {
    verb: "Include",
    title: "The whole classroom shapes the board.",
    body: "Student questions and contributions can become part of the shared visual explanation too.",
    icon: Users,
    tone: "chapter-ink",
    visual: "include"
  }
];

const impactSteps = [
  "Student focus",
  "Understanding",
  "Higher scores",
  "School rankings",
  "Enrollment",
  "Revenue"
];

const competitors = [
  { name: "Canva", visuals: true, live: false, room: false, composed: false },
  { name: "Google Slides", visuals: true, live: false, room: false, composed: false },
  { name: "ChatGPT", visuals: true, live: false, room: false, composed: true },
  { name: "Imagineer", visuals: true, live: true, room: true, composed: true, featured: true }
];

const team = [
  {
    initials: "VP",
    name: "Vivaan",
    role: "CEO",
    note: "The one who could not picture that biology diagram in sophomore year."
  },
  {
    initials: "JM",
    name: "Jackson",
    role: "CFO",
    note: "Turning classroom outcomes into a business schools can say yes to."
  },
  {
    initials: "KS",
    name: "Krish",
    role: "CTO",
    note: "Building the live system that keeps the visual canvas moving."
  }
];

const statement =
  "What if the teacher just talked, and the board kept up on its own?";

function JourneyVisual({ type }: { type: string }) {
  if (type === "listen") {
    return (
      <div className="journey-visual journey-listen" aria-hidden="true">
        <div className="listen-wave">
          {Array.from({ length: 19 }).map((_, index) => <i key={index} />)}
        </div>
        <span className="listen-signal"><AudioLines /></span>
      </div>
    );
  }

  if (type === "understand") {
    return (
      <div className="journey-visual journey-understand" aria-hidden="true">
        <div className="reason-core"><Layers3 /></div>
        <span /><span /><span /><span /><span />
        <i /><i /><i /><i />
      </div>
    );
  }

  if (type === "draw") {
    return (
      <div className="journey-visual journey-draw" aria-hidden="true">
        <div className="draw-board">
          <span className="draw-heading" />
          <span className="draw-line draw-line-one" />
          <span className="draw-line draw-line-two" />
          <span className="draw-node draw-node-one" />
          <span className="draw-node draw-node-two" />
          <span className="draw-connector" />
        </div>
        <WandSparkles />
      </div>
    );
  }

  return (
    <div className="journey-visual journey-include" aria-hidden="true">
      <div className="room-board"><Sparkles /></div>
      <span className="room-person room-person-one"><i /></span>
      <span className="room-person room-person-two"><i /></span>
      <span className="room-person room-person-three"><i /></span>
      <span className="room-person room-person-four"><i /></span>
    </div>
  );
}

function Availability({ available }: { available: boolean }) {
  return available ? (
    <span className="matrix-yes" aria-label="Yes"><Check aria-hidden="true" /></span>
  ) : (
    <span className="matrix-no" aria-label="No"><Minus aria-hidden="true" /></span>
  );
}

export function MarketingExperience() {
  const root = useRef<HTMLElement>(null);
  const horizontalSection = useRef<HTMLElement>(null);
  const horizontalTrack = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      if (reduceMotion) {
        gsap.set("[data-motion], [data-reveal]", {
          opacity: 1,
          y: 0,
          clearProps: "transform"
        });
        return;
      }

      const intro = gsap.timeline({ defaults: { ease: "power4.out" } });
      intro
        .from(".hero-word", {
          yPercent: 115,
          rotateX: -24,
          opacity: 0,
          duration: 1.15,
          stagger: 0.08
        })
        .from(".hero-support", { y: 28, opacity: 0, duration: 0.8 }, "-=0.62")
        .from(".hero-actions", { y: 20, opacity: 0, duration: 0.7 }, "-=0.54");

      gsap.to(".hero-copy", {
        yPercent: -18,
        opacity: 0.35,
        ease: "none",
        scrollTrigger: {
          trigger: ".hero",
          start: "top top",
          end: "bottom top",
          scrub: 1
        }
      });
      gsap.to(".knowledge-scene", {
        yPercent: 22,
        rotate: 3,
        ease: "none",
        scrollTrigger: {
          trigger: ".hero",
          start: "top top",
          end: "bottom top",
          scrub: 1.2
        }
      });

      gsap.from(".bento-item", {
        y: 90,
        rotateX: 8,
        opacity: 0,
        duration: 1,
        stagger: 0.12,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".learning-bento",
          start: "top 72%"
        }
      });

      gsap.fromTo(
        ".statement-word",
        { opacity: 0.12 },
        {
          opacity: 1,
          stagger: 0.08,
          ease: "none",
          scrollTrigger: {
            trigger: ".statement-section",
            start: "top 72%",
            end: "bottom 42%",
            scrub: 1
          }
        }
      );

      const media = gsap.matchMedia();
      media.add("(min-width: 768px)", () => {
        const section = horizontalSection.current;
        const track = horizontalTrack.current;
        if (!section || !track) {
          return;
        }

        const getDistance = () => Math.max(0, track.scrollWidth - window.innerWidth);
        gsap.to(track, {
          x: () => -getDistance(),
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: () => `+=${getDistance()}`,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true
          }
        });
      });

      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((element) => {
        gsap.from(element, {
          y: 70,
          opacity: 0,
          duration: 0.95,
          ease: "power3.out",
          scrollTrigger: { trigger: element, start: "top 84%" }
        });
      });

      gsap.from(".impact-step", {
        y: 42,
        opacity: 0,
        duration: 0.75,
        stagger: 0.12,
        ease: "power3.out",
        scrollTrigger: { trigger: ".impact-flow", start: "top 76%" }
      });

      return () => media.revert();
    },
    { scope: root }
  );

  return (
    <main
      ref={root}
      id="main-content"
      className="marketing-page"
      tabIndex={-1}
    >
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <LaunchLoader />
      <SmoothScroll />

      <header className="marketing-nav">
        <Link href="#top" className="marketing-wordmark" aria-label="Imagineer home">
          <span className="brand-logo-stack" aria-hidden="true">
            <Image
              src="/brand/imagineer-shortform.png"
              alt=""
              width={32}
              height={32}
              className="brand-logo brand-logo-dark"
              priority
            />
            <Image
              src="/brand/imagineer-shortform-light.png"
              alt=""
              width={32}
              height={32}
              className="brand-logo brand-logo-light"
              priority
            />
          </span>
          IMAGINEER
        </Link>
        <nav aria-label="Page sections">
          <Link href="#problem">The problem</Link>
          <Link href="#product">The product</Link>
          <Link href="#business">The business</Link>
          <Link href="#team">The team</Link>
        </nav>
        <div className="nav-actions">
          <ThemeToggle />
          <Button className="nav-open" type="button" onClick={() => window.location.assign("/canvas")}>
            Try Imagine <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <section id="top" className="hero">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-copy">
          <div className="hero-title-mask">
            <h1>
              <span className="hero-word">
                IMAGINE <em>v1</em>
              </span>
            </h1>
          </div>
          <div className="hero-title-mask hero-title-secondary">
            <p className="hero-word">The board keeps up.</p>
          </div>
          <p className="hero-support">
            A live assistant that listens to the classroom and draws every idea as it is explained.
          </p>
          <div className="hero-actions">
            <Link href="/canvas" className="primary-link">
              Try Imagine <span><ArrowRight className="h-5 w-5" aria-hidden="true" /></span>
            </Link>
            <Link href="#problem" className="text-link">See why it matters</Link>
          </div>
        </div>
        <KnowledgeScene />
        <div className="hero-caption" aria-hidden="true">
          <span>Voice</span><i /><span>Visuals</span><i /><span>Understanding</span>
        </div>
      </section>

      <section id="problem" className="interest-section">
        <div className="interest-heading" data-motion>
          <h2>
            Static slides cannot
            <span className="inline-learning-visual" aria-hidden="true">
              <i /><i /><i /><i />
            </span>
            keep up.
          </h2>
          <p>
            Teachers are asked to explain ideas that move, while their tools stay frozen in time.
          </p>
        </div>

        <div className="learning-bento">
          <article className="bento-item bento-voice">
            <Presentation aria-hidden="true" />
            <div className="prep-number" aria-hidden="true">5-12</div>
            <h3>Hours of prep, every week.</h3>
            <p>Teachers burn time building slides instead of connecting with students.</p>
          </article>
          <article className="bento-item bento-model">
            <div className="frozen-frame" aria-hidden="true"><i /><i /><i /><b /></div>
            <h3>Complex ideas freeze.</h3>
            <p>Processes like the electron transport chain become one crowded still image.</p>
          </article>
          <article className="bento-item bento-control">
            <Users aria-hidden="true" />
            <div className="attention-ripples" aria-hidden="true"><i /><i /><i /></div>
            <h3>Attention has moved on.</h3>
            <p>Classrooms compete with the most visually engaging technology students own.</p>
          </article>
          <article className="bento-item bento-canvas">
            <div className="blank-wall" aria-hidden="true">
              <span>Close your eyes and picture it.</span>
              <div className="wall-sketch"><i /><i /><i /><b /><b /></div>
            </div>
            <h3>Students are told to imagine the missing picture.</h3>
            <p>If the concept was never made visible, there may be nothing there to see.</p>
          </article>
        </div>
      </section>

      <section className="statement-section">
        <p>
          {statement.split(" ").map((word, index) => (
            <span className="statement-word" key={`${word}-${index}`}>{word} </span>
          ))}
        </p>
      </section>

      <section id="product" ref={horizontalSection} className="horizontal-section">
        <div ref={horizontalTrack} className="horizontal-track">
          {chapters.map(({ verb, title, body, icon: Icon, tone, visual }) => (
            <article className={`journey-panel ${tone}`} key={verb}>
              <JourneyVisual type={visual} />
              <Icon className="journey-icon" aria-hidden="true" />
              <div>
                <p>{verb}</p>
                <h2>{title}</h2>
                <span>{body}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="formats-experience product-stack-section">
        <div className="formats-copy">
          <h2>Not a fancy drawing app.</h2>
          <p>Imagine changes the classroom from a prepared slideshow into a live shared explanation.</p>
        </div>
        <div className="format-accordion">
          <article className="accordion-panel" data-reveal>
            <div className="accordion-visual flow-visual" aria-hidden="true">
              <span /><i /><span /><i /><span />
            </div>
            <div><AudioLines aria-hidden="true" /><h3>Voice</h3><p>Captures teaching as it happens.</p></div>
          </article>
          <article className="accordion-panel" data-reveal>
            <div className="accordion-visual compare-visual" aria-hidden="true">
              <span><i /><i /><i /></span><b /><span><i /><i /></span>
            </div>
            <div><GitCompareArrows aria-hidden="true" /><h3>Reasoning</h3><p>Selects the right structure for the idea.</p></div>
          </article>
          <article className="accordion-panel" data-reveal>
            <div className="accordion-visual composition-visual" aria-hidden="true">
              <div className="composition-source"><i /><i /><i /><i /><i /></div>
              <span className="composition-beam" />
              <div className="composition-canvas">
                <span className="composition-title" />
                <span className="composition-copy" />
                <span className="composition-copy composition-copy-short" />
                <div className="composition-diagram"><i /><i /><i /><b /><b /></div>
              </div>
            </div>
            <div><Sparkles aria-hidden="true" /><h3>Visuals</h3><p>Composes a shared canvas in real time.</p></div>
          </article>
        </div>
      </section>

      <section className="impact-section">
        <div className="section-intro" data-reveal>
          <h2>When students do better, schools do better.</h2>
          <p>Imagine turns teacher time and student attention into outcomes a school can measure.</p>
        </div>
        <div className="impact-flow" aria-label="School impact pathway">
          {impactSteps.map((step, index) => (
            <div className="impact-step" key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
              {index < impactSteps.length - 1 && <ArrowDown aria-hidden="true" />}
            </div>
          ))}
        </div>
      </section>

      <section id="business" className="business-section">
        <div className="section-intro business-intro" data-reveal>
          <h2>Simple pricing. Strong school economics.</h2>
          <p>Schools buy flexible teacher licenses under one contract. Individual educators can start on their own.</p>
        </div>
        <div className="pricing-grid">
          <article className="price-card price-school" data-reveal>
            <School aria-hidden="true" />
            <span>School plan</span>
            <div><strong>$100</strong><small>/ teacher / month</small></div>
            <p>Choose the number of licenses. Negotiate and manage them under one school contract.</p>
          </article>
          <article className="price-card price-teacher" data-reveal>
            <GraduationCap aria-hidden="true" />
            <span>Individual plan</span>
            <div><strong>$39</strong><small>/ month</small></div>
            <p>A flexible entry point for teachers who want to bring Imagine into their own classroom.</p>
          </article>
          <article className="economics-card" data-reveal>
            <div className="margin-ring" aria-hidden="true"><span>93%</span></div>
            <div>
              <span>School plan unit economics</span>
              <h3>About $7 in monthly model cost.</h3>
              <p>Voice-to-text, language, and visual generation leave more than 90% gross margin at school-plan pricing.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="go-to-market-section">
        <div className="gtm-copy" data-reveal>
          <h2>Start where adoption can move faster.</h2>
          <p>Tuition-paying schools have the resources and incentive to test ambitious educational technology.</p>
          <div className="beachhead-tag"><Building2 aria-hidden="true" /> Innovative private schools</div>
        </div>
        <div className="adoption-system" data-reveal>
          <div className="adoption-ladder">
            <span>Teacher</span><ArrowDown aria-hidden="true" />
            <span>Department chair</span><ArrowDown aria-hidden="true" />
            <span>Principal</span>
          </div>
          <p>Every successful classroom becomes a live demo for the next decision-maker.</p>
        </div>
        <div className="expansion-formula" data-reveal>
          <span>Pilots</span><i>+</i><span>Results</span><i>+</i><span>Case studies</span><i>=</i><strong>Expansion</strong>
        </div>
      </section>

      <section className="market-section">
        <div className="market-number" data-reveal>
          <CircleDollarSign aria-hidden="true" />
          <span>Total addressable market</span>
          <strong>$2.4B</strong>
          <p>in annual opportunity</p>
        </div>
        <div className="tam-calculation" data-reveal>
          <div><span>Reachable teachers</span><strong>2.15M</strong></div>
          <div><span>Effective monthly license</span><strong>~$93</strong></div>
          <div><span>Months</span><strong>12</strong></div>
          <div className="tam-total"><span>Estimated TAM</span><strong>≈ $2.4B</strong></div>
          <p>Uses the pitch estimate and an effective contracted rate below the $100 school list price.</p>
        </div>
      </section>

      <section className="competition-section">
        <div className="section-intro" data-reveal>
          <h2>A new category of educational technology.</h2>
          <p>Other tools make visuals. Imagineer makes them live, inside the discussion, as teaching happens.</p>
        </div>
        <div className="comparison-table-wrap" data-reveal>
          <table className="comparison-table">
            <thead>
              <tr>
                <th scope="col">Platform</th>
                <th scope="col">Creates visuals</th>
                <th scope="col">Live in class</th>
                <th scope="col">Whole-room input</th>
                <th scope="col">Auto-composes</th>
              </tr>
            </thead>
            <tbody>
              {competitors.map((competitor) => (
                <tr className={competitor.featured ? "comparison-featured" : undefined} key={competitor.name}>
                  <th scope="row">{competitor.name}</th>
                  <td><Availability available={competitor.visuals} /></td>
                  <td><Availability available={competitor.live} /></td>
                  <td><Availability available={competitor.room} /></td>
                  <td><Availability available={competitor.composed} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="triangle-section">
        <div className="triangle-map" aria-hidden="true">
          <div className="map-grid" />
          <span className="map-ring map-ring-one" />
          <span className="map-ring map-ring-two" />
          <MapPin />
          <strong>Durham, NC</strong>
        </div>
        <div className="triangle-copy" data-reveal>
          <h2>The first customers are already nearby.</h2>
          <p>Durham Academy is minutes from campus. Land a few schools, run live demos, prove outcomes, and let teachers carry the story forward.</p>
          <span>Triangle, North Carolina</span>
        </div>
      </section>

      <section className="world-section">
        <div className="world-copy" data-reveal>
          <h2>Education is the beachhead. Understanding is the product.</h2>
          <p>Once spoken ideas can animate themselves, the canvas can follow anyone explaining something hard.</p>
        </div>
        <div className="world-grid">
          <article data-reveal><School aria-hidden="true" /><span>Classroom</span></article>
          <article data-reveal><GraduationCap aria-hidden="true" /><span>Lecture hall</span></article>
          <article data-reveal><Building2 aria-hidden="true" /><span>Boardroom</span></article>
          <article data-reveal><Presentation aria-hidden="true" /><span>Keynote stage</span></article>
        </div>
      </section>

      <section id="team" className="team-section">
        <div className="section-intro" data-reveal>
          <h2>Built by the students who lived the problem.</h2>
          <p>Three NCSSM students building the classroom tool they wished they had.</p>
        </div>
        <div className="team-grid">
          {team.map((member) => (
            <article className="team-member" data-reveal key={member.name}>
              <div aria-hidden="true">{member.initials}</div>
              <span>{member.role}</span>
              <h3>{member.name}</h3>
              <p>{member.note}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="marketing-footer">
        <div className="footer-orbit" aria-hidden="true"><i /><i /><i /><b /></div>
        <p>Instead of closing your eyes and imagining it,</p>
        <h2>IMAGINEER IT.</h2>
        <Link href="/canvas" className="footer-link">
          Try Imagine <span><ArrowRight className="h-6 w-6" aria-hidden="true" /></span>
        </Link>
        <div className="footer-bottom">
          <span>Visual understanding, composed live.</span>
          <Link href="#top">Back to top</Link>
        </div>
      </footer>
    </main>
  );
}
