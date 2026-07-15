"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef } from "react";
import {
  ArrowRight,
  AudioLines,
  Blocks,
  Braces,
  GitCompareArrows,
  Layers3,
  Sparkles
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
    verb: "Speak",
    title: "Start where the idea starts.",
    body: "Use your natural voice or type the thought exactly as it arrives.",
    icon: AudioLines,
    tone: "chapter-lime"
  },
  {
    verb: "Structure",
    title: "Find the shape inside it.",
    body: "Imagine v1 identifies sequence, contrast, hierarchy, and relationships.",
    icon: Braces,
    tone: "chapter-cobalt"
  },
  {
    verb: "See",
    title: "Match the visual to the lesson.",
    body: "Notes, diagrams, comparisons, and timelines share one clear canvas.",
    icon: Layers3,
    tone: "chapter-paper"
  },
  {
    verb: "Build",
    title: "Keep the class moving.",
    body: "The explanation arrives as a composed teaching surface, ready to use.",
    icon: Sparkles,
    tone: "chapter-ink"
  }
];

const statement =
  "A difficult idea should not become simpler. It should become easier to see.";

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
        gsap.set("[data-motion]", { opacity: 1, y: 0, clearProps: "transform" });
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

      gsap.utils.toArray<HTMLElement>(".accordion-panel").forEach((panel) => {
        gsap.from(panel, {
          y: 70,
          opacity: 0,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: panel, start: "top 84%" }
        });
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
          <Link href="#difference">Why Imagine v1</Link>
          <Link href="#journey">How it works</Link>
          <Link href="#formats">Learning formats</Link>
        </nav>
        <div className="nav-actions">
          <ThemeToggle />
          <Button className="nav-open" type="button" onClick={() => window.location.assign("/canvas")}>
            Open canvas <ArrowRight className="h-4 w-4" aria-hidden="true" />
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
            <p className="hero-word">Ideas become visible.</p>
          </div>
          <p className="hero-support">
            A live thinking canvas for educators who explain complex things.
          </p>
          <div className="hero-actions">
            <Link href="/canvas" className="primary-link">
              Start teaching <span><ArrowRight className="h-5 w-5" aria-hidden="true" /></span>
            </Link>
            <Link href="#difference" className="text-link">See the system</Link>
          </div>
        </div>
        <KnowledgeScene />
        <div className="hero-caption" aria-hidden="true">
          <span>Voice</span><i /><span>Structure</span><i /><span>Understanding</span>
        </div>
      </section>

      <section id="difference" className="interest-section">
        <div className="interest-heading" data-motion>
          <h2>
            Teach at the speed
            <span className="inline-learning-visual" aria-hidden="true">
              <i /><i /><i /><i />
            </span>
            you think.
          </h2>
          <p>
            Imagine v1 turns spoken or typed explanations into visual teaching
            surfaces without interrupting the flow of the lesson.
          </p>
        </div>

        <div className="learning-bento">
          <article className="bento-item bento-voice">
            <AudioLines aria-hidden="true" />
            <div className="voice-lines" aria-hidden="true">
              {Array.from({ length: 18 }).map((_, index) => <i key={index} />)}
            </div>
            <h3>Capture the explanation.</h3>
            <p>Speak naturally or type. You decide when the idea is ready.</p>
          </article>
          <article className="bento-item bento-model">
            <div className="model-orbit" aria-hidden="true"><i /><i /><i /><b /></div>
            <h3>The right mental model.</h3>
            <p>Sequence, comparison, diagram, or a balanced visual canvas.</p>
          </article>
          <article className="bento-item bento-control">
            <GitCompareArrows aria-hidden="true" />
            <h3>Clarity without autopilot.</h3>
            <p>Nothing submits until you choose. The teacher stays in control.</p>
          </article>
          <article className="bento-item bento-canvas">
            <div className="canvas-stack" aria-hidden="true">
              <span><b>Concept</b><i /><i /></span>
              <span><b>Sequence</b><i /><i /><i /></span>
              <span><b>Visual</b><em /></span>
            </div>
            <h3>One canvas, composed for the idea.</h3>
            <p>Every block has a reason to be there, from concise notes to visual explanation.</p>
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

      <section id="journey" ref={horizontalSection} className="horizontal-section">
        <div ref={horizontalTrack} className="horizontal-track">
          {chapters.map(({ verb, title, body, icon: Icon, tone }) => (
            <article className={`journey-panel ${tone}`} key={verb}>
              <div className="journey-orbit" aria-hidden="true"><i /><i /><b /></div>
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

      <section id="formats" className="formats-experience">
        <div className="formats-copy">
          <h2>Every idea asks for a different view.</h2>
          <p>Move across the formats to see how the same thinking becomes teachable.</p>
        </div>
        <div className="format-accordion">
          <article className="accordion-panel">
            <div className="accordion-visual flow-visual" aria-hidden="true">
              <span /><i /><span /><i /><span />
            </div>
            <div><Blocks aria-hidden="true" /><h3>Sequence</h3><p>Give every step a clear place.</p></div>
          </article>
          <article className="accordion-panel">
            <div className="accordion-visual compare-visual" aria-hidden="true">
              <span><i /><i /><i /></span><b /><span><i /><i /></span>
            </div>
            <div><GitCompareArrows aria-hidden="true" /><h3>Comparison</h3><p>Make the difference visible.</p></div>
          </article>
          <article className="accordion-panel">
            <div className="accordion-visual network-visual" aria-hidden="true">
              <i /><i /><i /><i /><i /><b /><b /><b />
            </div>
            <div><Sparkles aria-hidden="true" /><h3>Visual-led</h3><p>Let the model carry the explanation.</p></div>
          </article>
        </div>
      </section>

      <footer className="marketing-footer">
        <div className="footer-orbit" aria-hidden="true"><i /><i /><i /><b /></div>
        <p>Put the next idea in motion.</p>
        <h2>IMAGINEER</h2>
        <Link href="/canvas" className="footer-link">
          Open the canvas <span><ArrowRight className="h-6 w-6" aria-hidden="true" /></span>
        </Link>
        <div className="footer-bottom">
          <span>Visual learning, composed live.</span>
          <Link href="#top">Back to top</Link>
        </div>
      </footer>
    </main>
  );
}
