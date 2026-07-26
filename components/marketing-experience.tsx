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
    tone: "bg-[var(--signal)] text-[var(--signal-ink)]",
    visual: "listen"
  },
  {
    verb: "Understand",
    title: "The system finds the idea inside it.",
    body: "A layered voice, language, and visual stack identifies sequence, contrast, hierarchy, and relationships.",
    icon: Layers3,
    tone: "bg-[var(--inquiry)] text-[#f8f9ff]",
    visual: "understand"
  },
  {
    verb: "Draw",
    title: "The picture builds in the room.",
    body: "Notes, diagrams, comparisons, and visual models appear the second the idea is spoken.",
    icon: WandSparkles,
    tone: "bg-[var(--paper)] text-[#151915]",
    visual: "draw"
  },
  {
    verb: "Include",
    title: "The whole classroom shapes the board.",
    body: "Student questions and contributions can become part of the shared visual explanation too.",
    icon: Users,
    tone: "bg-[#101310] text-[#f2f5ee]",
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

const accordionPanelClass =
  "group relative flex min-w-0 flex-1 flex-col justify-between overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] p-[26px] transition-[flex,transform] duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:flex-[1.75] hover:-translate-y-2 max-[767px]:min-h-[540px] max-[767px]:flex-none max-[767px]:hover:flex-none max-[767px]:hover:transform-none [&>div:last-child>svg]:mb-5 [&>div:last-child>svg]:h-6 [&>div:last-child>svg]:w-6 [&>div:last-child>svg]:text-[var(--signal)] [&_h3]:m-0 [&_h3]:font-[var(--display)] [&_h3]:text-[clamp(2rem,3vw,3.4rem)] [&_p]:mb-0 [&_p]:mt-3 [&_p]:max-w-[280px] [&_p]:leading-[1.45] [&_p]:text-[var(--text-soft)]";

const sectionIntroClass =
  "max-w-[980px] [&_h2]:m-0 [&_h2]:font-[var(--display)] [&_h2]:text-[clamp(3.2rem,7vw,7.8rem)] [&_h2]:font-[850] [&_h2]:leading-[0.92] [&_p]:mb-0 [&_p]:mt-7 [&_p]:max-w-[660px] [&_p]:text-[clamp(17px,1.5vw,21px)] [&_p]:leading-[1.55] [&_p]:text-[var(--text-soft)]";

function JourneyVisual({ type }: { type: string }) {
  if (type === "listen") {
    return (
      <div className="pointer-events-none absolute right-[4%] top-[6%] h-[min(62vw,760px)] w-[min(62vw,760px)] before:absolute before:left-1/2 before:top-1/2 before:h-[76%] before:w-[76%] before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:border before:border-current before:opacity-25 before:content-[''] after:absolute after:left-1/2 after:top-1/2 after:h-[48%] after:w-[48%] after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border after:border-current after:opacity-25 after:content-[''] max-[767px]:right-[-34%] max-[767px]:top-[7%] max-[767px]:h-[120vw] max-[767px]:w-[120vw]" aria-hidden="true">
        <div className="absolute left-[13%] right-[13%] top-1/2 flex -translate-y-1/2 items-center justify-center gap-[clamp(5px,0.7vw,10px)] [&_i]:h-[82px] [&_i]:w-[clamp(3px,0.45vw,6px)] [&_i]:animate-journey-wave [&_i]:rounded-full [&_i]:bg-current [&_i]:opacity-[0.72] motion-reduce:[&_i]:animate-none [&_i:nth-child(3n)]:h-[190px] [&_i:nth-child(3n)]:[animation-delay:130ms] [&_i:nth-child(4n)]:h-[122px] [&_i:nth-child(4n)]:[animation-delay:280ms] [&_i:nth-child(5n)]:h-[230px] [&_i:nth-child(5n)]:[animation-delay:410ms] [&_i:nth-child(6n)]:h-[58px] [&_i:nth-child(6n)]:[animation-delay:540ms]">
          {Array.from({ length: 19 }).map((_, index) => <i key={index} />)}
        </div>
        <span className="absolute left-1/2 top-1/2 grid h-[98px] w-[98px] -translate-x-1/2 -translate-y-1/2 animate-listen-pulse place-items-center rounded-full border border-current bg-[color-mix(in_srgb,currentColor_16%,transparent)] motion-reduce:animate-none [&_svg]:h-[34px] [&_svg]:w-[34px]"><AudioLines /></span>
      </div>
    );
  }

  if (type === "understand") {
    return (
      <div className="pointer-events-none absolute right-[4%] top-[6%] h-[min(62vw,760px)] w-[min(62vw,760px)] rotate-[-8deg] max-[767px]:right-[-34%] max-[767px]:top-[7%] max-[767px]:h-[120vw] max-[767px]:w-[120vw] [&>span]:absolute [&>span]:h-[34px] [&>span]:w-[34px] [&>span]:animate-reason-node [&>span]:rounded-full [&>span]:border-[3px] [&>span]:border-current [&>span]:bg-transparent motion-reduce:[&>span]:animate-none [&>span:nth-of-type(1)]:left-[42%] [&>span:nth-of-type(1)]:top-[10%] [&>span:nth-of-type(1)]:[--node-x:18px] [&>span:nth-of-type(1)]:[--node-y:9px] [&>span:nth-of-type(2)]:right-[9%] [&>span:nth-of-type(2)]:top-[29%] [&>span:nth-of-type(2)]:[--node-x:-12px] [&>span:nth-of-type(2)]:[--node-y:16px] [&>span:nth-of-type(2)]:[animation-delay:260ms] [&>span:nth-of-type(3)]:bottom-[11%] [&>span:nth-of-type(3)]:right-[18%] [&>span:nth-of-type(3)]:[--node-x:-18px] [&>span:nth-of-type(3)]:[--node-y:-7px] [&>span:nth-of-type(3)]:[animation-delay:520ms] [&>span:nth-of-type(4)]:bottom-[7%] [&>span:nth-of-type(4)]:left-[20%] [&>span:nth-of-type(4)]:[--node-x:14px] [&>span:nth-of-type(4)]:[--node-y:-16px] [&>span:nth-of-type(4)]:[animation-delay:780ms] [&>span:nth-of-type(5)]:left-[5%] [&>span:nth-of-type(5)]:top-[34%] [&>span:nth-of-type(5)]:[--node-x:18px] [&>span:nth-of-type(5)]:[--node-y:5px] [&>span:nth-of-type(5)]:[animation-delay:1040ms] [&>i]:absolute [&>i]:left-1/2 [&>i]:top-1/2 [&>i]:h-px [&>i]:w-[38%] [&>i]:origin-left [&>i]:bg-current [&>i]:opacity-30 [&>i:nth-of-type(1)]:rotate-[-78deg] [&>i:nth-of-type(2)]:rotate-[-20deg] [&>i:nth-of-type(3)]:rotate-[47deg] [&>i:nth-of-type(4)]:rotate-[145deg]" aria-hidden="true">
        <div className="absolute left-1/2 top-1/2 z-[2] grid h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 animate-reason-turn place-items-center rounded-full border border-current bg-[color-mix(in_srgb,currentColor_14%,transparent)] motion-reduce:animate-none [&_svg]:h-12 [&_svg]:w-12"><Layers3 /></div>
        <span /><span /><span /><span /><span />
        <i /><i /><i /><i />
      </div>
    );
  }

  if (type === "draw") {
    return (
      <div className="pointer-events-none absolute right-[4%] top-[6%] h-[min(62vw,760px)] w-[min(62vw,760px)] [perspective:900px] max-[767px]:right-[-34%] max-[767px]:top-[7%] max-[767px]:h-[120vw] max-[767px]:w-[120vw] [&>svg]:absolute [&>svg]:right-[7%] [&>svg]:top-[11%] [&>svg]:h-[54px] [&>svg]:w-[54px] [&>svg]:animate-draw-tool motion-reduce:[&>svg]:animate-none" aria-hidden="true">
        <div className="absolute bottom-[17%] left-[12%] right-[7%] top-[10%] overflow-hidden rounded-lg border border-current bg-[color-mix(in_srgb,currentColor_5%,transparent)] [transform:rotateX(6deg)_rotateY(-10deg)_rotateZ(-2deg)] [&>span]:absolute [&>span]:block">
          <span className="left-[9%] top-[13%] h-[11px] w-[36%] origin-left scale-x-0 animate-draw-stroke rounded-full bg-current motion-reduce:animate-none" />
          <span className="left-[9%] top-[23%] h-[5px] w-[56%] origin-left scale-x-0 animate-draw-stroke rounded-full bg-current [animation-delay:300ms] motion-reduce:animate-none" />
          <span className="left-[9%] top-[30%] h-[5px] w-[42%] origin-left scale-x-0 animate-draw-stroke rounded-full bg-current [animation-delay:520ms] motion-reduce:animate-none" />
          <span className="left-[20%] top-[52%] h-[76px] w-[76px] scale-0 animate-draw-node rounded-full border-[3px] border-current [animation-delay:880ms] motion-reduce:animate-none" />
          <span className="right-[20%] top-[52%] h-[76px] w-[76px] scale-0 animate-draw-node rounded-full border-[3px] border-current [animation-delay:1180ms] motion-reduce:animate-none" />
          <span className="left-[calc(20%+76px)] top-[calc(52%+37px)] h-0.5 w-[calc(60%-152px)] origin-left scale-x-0 animate-draw-stroke [animation-delay:1480ms] bg-current motion-reduce:animate-none" />
        </div>
        <WandSparkles />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute right-[4%] top-[6%] h-[min(62vw,760px)] w-[min(62vw,760px)] max-[767px]:right-[-34%] max-[767px]:top-[7%] max-[767px]:h-[120vw] max-[767px]:w-[120vw]" aria-hidden="true">
      <div className="absolute left-1/2 top-1/2 z-[2] grid h-[230px] w-[230px] -translate-x-1/2 -translate-y-1/2 animate-room-board-pulse place-items-center rounded-full border border-current bg-[color-mix(in_srgb,currentColor_8%,transparent)] motion-reduce:animate-none [&_svg]:h-[58px] [&_svg]:w-[58px] [&_svg]:text-[var(--signal)]"><Sparkles /></div>
      <span className="absolute left-[47%] top-[8%] h-[58px] w-[58px] rounded-full border-2 border-current after:absolute after:left-1/2 after:top-[65px] after:h-11 after:w-[92px] after:-translate-x-1/2 after:rounded-[50%_50%_8px_8px] after:border after:border-current after:opacity-[0.38] after:content-[''] [&_i]:absolute [&_i]:left-1/2 [&_i]:top-[-54px] [&_i]:h-[34px] [&_i]:w-[54px] [&_i]:animate-room-speak [&_i]:rounded-[18px_18px_18px_4px] [&_i]:border [&_i]:border-current [&_i]:opacity-0 motion-reduce:[&_i]:animate-none"><i /></span>
      <span className="absolute right-[6%] top-[42%] h-[58px] w-[58px] rounded-full border-2 border-current after:absolute after:left-1/2 after:top-[65px] after:h-11 after:w-[92px] after:-translate-x-1/2 after:rounded-[50%_50%_8px_8px] after:border after:border-current after:opacity-[0.38] after:content-[''] [&_i]:absolute [&_i]:left-1/2 [&_i]:top-[-54px] [&_i]:h-[34px] [&_i]:w-[54px] [&_i]:animate-room-speak [&_i]:rounded-[18px_18px_18px_4px] [&_i]:border [&_i]:border-current [&_i]:opacity-0 [&_i]:[animation-delay:1.2s] motion-reduce:[&_i]:animate-none"><i /></span>
      <span className="absolute bottom-[3%] right-[23%] h-[58px] w-[58px] rounded-full border-2 border-current after:absolute after:left-1/2 after:top-[65px] after:h-11 after:w-[92px] after:-translate-x-1/2 after:rounded-[50%_50%_8px_8px] after:border after:border-current after:opacity-[0.38] after:content-[''] [&_i]:absolute [&_i]:left-1/2 [&_i]:top-[-54px] [&_i]:h-[34px] [&_i]:w-[54px] [&_i]:animate-room-speak [&_i]:rounded-[18px_18px_18px_4px] [&_i]:border [&_i]:border-current [&_i]:opacity-0 [&_i]:[animation-delay:2.4s] motion-reduce:[&_i]:animate-none"><i /></span>
      <span className="absolute bottom-[8%] left-[16%] h-[58px] w-[58px] rounded-full border-2 border-current after:absolute after:left-1/2 after:top-[65px] after:h-11 after:w-[92px] after:-translate-x-1/2 after:rounded-[50%_50%_8px_8px] after:border after:border-current after:opacity-[0.38] after:content-[''] [&_i]:absolute [&_i]:left-1/2 [&_i]:top-[-54px] [&_i]:h-[34px] [&_i]:w-[54px] [&_i]:animate-room-speak [&_i]:rounded-[18px_18px_18px_4px] [&_i]:border [&_i]:border-current [&_i]:opacity-0 [&_i]:[animation-delay:3.6s] motion-reduce:[&_i]:animate-none"><i /></span>
    </div>
  );
}
function Availability({ available }: { available: boolean }) {
  return available ? (
    <span className="inline-grid h-[34px] w-[34px] place-items-center rounded-full text-[var(--signal)] [&_svg]:w-5" aria-label="Yes"><Check aria-hidden="true" /></span>
  ) : (
    <span className="inline-grid h-[34px] w-[34px] place-items-center rounded-full text-[var(--text-soft)] opacity-50 [&_svg]:w-5" aria-label="No"><Minus aria-hidden="true" /></span>
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
      className="marketing-page w-full max-w-full overflow-x-clip bg-[var(--page)] text-[var(--text)]"
      tabIndex={-1}
    >
      <a href="#main-content" className="fixed left-3 top-3 z-[100] -translate-y-[calc(100%+28px)] rounded bg-[var(--signal)] px-[15px] py-[11px] font-[750] text-[var(--signal-ink)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:translate-y-0">
        Skip to main content
      </a>
      <LaunchLoader />
      <SmoothScroll />

      <header className="fixed left-1/2 top-[18px] z-40 grid h-16 w-[min(1240px,calc(100%-32px))] -translate-x-1/2 grid-cols-[1fr_auto_1fr] items-center rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--page)_78%,transparent)] py-0 pl-5 pr-[10px] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--text)_9%,transparent),0_18px_55px_var(--shadow)] [backdrop-filter:blur(20px)_saturate(130%)] max-[1000px]:grid-cols-[1fr_auto] max-[1000px]:[&>nav]:hidden max-[767px]:top-[10px] max-[767px]:h-[58px] max-[767px]:w-[calc(100%-20px)] max-[767px]:pl-[15px]">
        <Link href="#top" className="inline-flex w-max items-center gap-[10px] font-[850] max-[767px]:text-sm" aria-label="Imagineer home">
          <span className="relative h-8 w-8 flex-none max-[767px]:h-7 max-[767px]:w-7" aria-hidden="true">
            <Image
              src="/brand/imagineer-shortform.png"
              alt=""
              width={32}
              height={32}
              className="brand-logo-dark absolute inset-0 h-8 w-8 rounded-[7px] shadow-[0_0_0_1px_color-mix(in_srgb,var(--signal)_22%,transparent)] max-[767px]:h-7 max-[767px]:w-7 max-[767px]:rounded-md"
              priority
            />
            <Image
              src="/brand/imagineer-shortform-light.png"
              alt=""
              width={32}
              height={32}
              className="brand-logo-light absolute inset-0 hidden h-8 w-8 rounded-[7px] shadow-[0_0_0_1px_color-mix(in_srgb,var(--signal)_22%,transparent)] max-[767px]:h-7 max-[767px]:w-7 max-[767px]:rounded-md"
              priority
            />
          </span>
          IMAGINEER
        </Link>
        <nav aria-label="Page sections" className="flex gap-7 text-[13px] text-[var(--text-soft)] [&_a]:transition-colors [&_a]:duration-[400ms] [&_a]:ease-[cubic-bezier(0.16,1,0.3,1)] [&_a:hover]:text-[var(--text)]">
          <Link href="#problem">The problem</Link>
          <Link href="#product">The product</Link>
          <Link href="#business">The business</Link>
          <Link href="#team">The team</Link>
        </nav>
        <div className="flex items-center justify-self-end gap-2">
          <ThemeToggle />
          <Button className="h-11 rounded-full bg-[var(--signal)] text-[var(--signal-ink)] transition-[transform,background-color] duration-[450ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-[var(--signal)] hover:opacity-100 max-[767px]:hidden" type="button" onClick={() => window.location.assign("/canvas")}>
            Try Imagine <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <section id="top" className="hero relative isolate flex min-h-[max(760px,100dvh)] items-center overflow-hidden px-[max(24px,5vw)] pb-[70px] pt-[116px] before:absolute before:inset-0 before:-z-[2] before:bg-[radial-gradient(circle_at_76%_44%,color-mix(in_srgb,var(--inquiry)_21%,transparent),transparent_29%),radial-gradient(circle_at_62%_56%,color-mix(in_srgb,var(--signal)_16%,transparent),transparent_23%),var(--page)] before:content-[''] max-[767px]:items-start max-[767px]:px-[18px] max-[767px]:pb-12 max-[767px]:pt-[130px]">
        <div className="absolute inset-0 -z-[1] bg-[linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] bg-[length:clamp(58px,6vw,92px)_clamp(58px,6vw,92px)] opacity-[0.34] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]" aria-hidden="true" />
        <div className="hero-copy relative z-4 w-[min(1180px,78vw)] max-[1000px]:w-[90vw] max-[767px]:w-full">
          <div className="overflow-hidden pb-[0.08em] [&_h1]:m-0 [&_h1]:font-[var(--display)] [&_h1]:text-[clamp(5.2rem,15vw,14rem)] [&_h1]:font-[880] [&_h1]:leading-[0.82] [&_h1]:tracking-normal max-[767px]:[&_h1]:text-[clamp(4.5rem,23vw,7.2rem)]">
            <h1>
              <span className="hero-word block origin-bottom [&_em]:inline-flex [&_em]:translate-y-[0.18em] [&_em]:rounded-full [&_em]:border [&_em]:border-[var(--line-strong)] [&_em]:px-[0.48em] [&_em]:pb-[0.3em] [&_em]:pt-[0.35em] [&_em]:align-top [&_em]:text-[0.18em] [&_em]:not-italic [&_em]:leading-none [&_em]:tracking-[0.08em] [&_em]:text-[var(--signal)]">
                IMAGINE <em>v1</em>
              </span>
            </h1>
          </div>
          <div className="mt-[22px] overflow-hidden pb-[0.08em]">
            <p className="hero-word m-0 block origin-bottom font-[var(--display)] text-[clamp(2.4rem,6vw,6.5rem)] font-[880] leading-[0.82] tracking-normal text-[var(--text-soft)] max-[767px]:text-[clamp(2.25rem,11vw,4rem)] max-[767px]:leading-[0.94]">The board keeps up.</p>
          </div>
          <p className="hero-support mb-0 mt-[38px] max-w-[460px] text-[clamp(17px,1.5vw,22px)] leading-[1.45] text-[var(--text-soft)] max-[767px]:mt-6 max-[767px]:max-w-[310px]">
            A live assistant that listens to the classroom and draws every idea as it is explained.
          </p>
          <div className="hero-actions mt-[34px] flex items-center gap-6 max-[767px]:flex-col max-[767px]:items-stretch max-[767px]:gap-3">
            <Link href="/canvas" className="group inline-flex min-h-[58px] items-center gap-[18px] rounded-full bg-[var(--signal)] py-[7px] pl-6 pr-2 font-[760] text-[var(--signal-ink)] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[3px] max-[767px]:w-full max-[767px]:justify-between">
              Try Imagine <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--signal-ink)] text-[var(--signal)] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-rotate-[28deg]"><ArrowRight className="h-5 w-5" aria-hidden="true" /></span>
            </Link>
            <Link href="#problem" className="border-b border-[var(--line-strong)] py-[14px] text-[var(--text-soft)] transition-[color,border-color] duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[var(--signal)] hover:text-[var(--text)] max-[767px]:w-max">See why it matters</Link>
          </div>
        </div>
        <KnowledgeScene />
        <div className="absolute bottom-[34px] right-[5vw] flex items-center gap-[10px] font-[var(--mono)] text-[10px] uppercase text-[var(--text-soft)] max-[767px]:hidden [&_i]:h-px [&_i]:w-[34px] [&_i]:bg-[var(--line-strong)]" aria-hidden="true">
          <span>Voice</span><i /><span>Visuals</span><i /><span>Understanding</span>
        </div>
      </section>

      <section id="problem" className="px-[max(20px,5vw)] py-[clamp(110px,14vw,210px)] max-[767px]:px-4 max-[767px]:py-[100px]">
        <div className="mb-[clamp(72px,10vw,150px)] max-w-[1120px] [&_h2]:m-0 [&_h2]:font-[var(--display)] [&_h2]:text-[clamp(3.4rem,8vw,8.6rem)] [&_h2]:font-[840] [&_h2]:leading-[0.92] [&_h2]:tracking-normal max-[767px]:[&_h2]:text-[clamp(3rem,14vw,4.6rem)] [&>p]:mb-0 [&>p]:mt-8 [&>p]:max-w-[620px] [&>p]:text-[clamp(17px,1.5vw,21px)] [&>p]:leading-[1.55] [&>p]:text-[var(--text-soft)]" data-motion>
          <h2>
            Static slides cannot
            <span className="mx-[0.18em] inline-grid h-[clamp(42px,5vw,68px)] w-[clamp(96px,11vw,160px)] translate-y-[0.06em] grid-cols-4 items-end gap-[5px] overflow-hidden rounded-full border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-2 align-baseline max-[767px]:h-[42px] max-[767px]:w-[94px] [&_i]:block [&_i]:animate-inline-signal [&_i]:rounded-t-full [&_i]:rounded-b-sm [&_i]:bg-[var(--signal)] [&_i:nth-child(1)]:h-[38%] [&_i:nth-child(2)]:h-[90%] [&_i:nth-child(2)]:[animation-delay:150ms] [&_i:nth-child(3)]:h-[62%] [&_i:nth-child(3)]:bg-[var(--inquiry)] [&_i:nth-child(3)]:[animation-delay:300ms] [&_i:nth-child(4)]:h-[76%] [&_i:nth-child(4)]:[animation-delay:450ms]" aria-hidden="true">
              <i /><i /><i /><i />
            </span>
            keep up.
          </h2>
          <p>
            Teachers are asked to explain ideas that move, while their tools stay frozen in time.
          </p>
        </div>

        <div className="learning-bento grid auto-rows-[minmax(360px,auto)] grid-cols-12 grid-flow-dense gap-3 max-[767px]:grid-cols-1 max-[767px]:auto-rows-[420px]">
          <article className="bento-item group relative col-span-7 flex min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--signal)] p-[clamp(28px,4vw,54px)] text-[var(--signal-ink)] [transform-style:preserve-3d] transition-[transform,border-color] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1.5 hover:[transform:translateY(-6px)_rotateX(1deg)] hover:border-[var(--line-strong)] max-[767px]:col-span-1 [&>svg]:h-7 [&>svg]:w-7 [&>svg]:text-[var(--signal-ink)] [&>svg]:transition-transform [&>svg]:duration-[650ms] group-hover:[&>svg]:[transform:translate3d(7px,-5px,0)_rotate(-8deg)_scale(1.12)] [&_h3]:relative [&_h3]:mb-0 [&_h3]:mt-auto [&_h3]:font-[var(--display)] [&_h3]:text-[clamp(2rem,3.4vw,4rem)] [&_h3]:leading-[0.98] [&>p]:relative [&>p]:mb-0 [&>p]:mt-[14px] [&>p]:leading-[1.45] [&>p]:text-[rgba(17,22,11,0.68)]">
            <Presentation aria-hidden="true" />
            <div className="absolute right-[42px] top-[34px] origin-right font-[var(--display)] text-[clamp(5rem,10vw,10rem)] font-[880] leading-[0.8] opacity-20 transition-[opacity,transform] duration-[650ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-[-10px] group-hover:translate-y-2 group-hover:scale-[1.08] group-hover:opacity-[0.38] max-[767px]:right-7 max-[767px]:top-8" aria-hidden="true">5-12</div>
            <h3>Hours of prep, every week.</h3>
            <p>Teachers burn time building slides instead of connecting with students.</p>
          </article>
          <article className="bento-item group relative col-span-5 flex min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] p-[clamp(28px,4vw,54px)] [transform-style:preserve-3d] transition-[transform,border-color] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] hover:[transform:translateY(-6px)_rotateX(1deg)] hover:border-[var(--line-strong)] max-[767px]:col-span-1 [&_h3]:relative [&_h3]:mb-0 [&_h3]:mt-auto [&_h3]:font-[var(--display)] [&_h3]:text-[clamp(2rem,3.4vw,4rem)] [&_h3]:leading-[0.98] [&>p]:relative [&>p]:mb-0 [&>p]:mt-[14px] [&>p]:leading-[1.45] [&>p]:text-[var(--text-soft)]">
            <div className="absolute left-10 right-10 top-[42px] h-[150px] rounded-lg border border-[var(--line-strong)] bg-[linear-gradient(90deg,transparent_49.7%,var(--line-strong)_50%,transparent_50.3%),linear-gradient(transparent_49.7%,var(--line-strong)_50%,transparent_50.3%)] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] before:absolute before:left-[18%] before:top-5 before:h-[22px] before:w-[22px] before:rounded-full before:border-4 before:border-[var(--panel)] before:bg-[var(--inquiry)] before:shadow-[0_0_0_1px_var(--line-strong)] before:content-[''] before:transition-transform before:duration-700 after:absolute after:bottom-[22px] after:right-[20%] after:h-[22px] after:w-[22px] after:rounded-full after:border-4 after:border-[var(--panel)] after:bg-[var(--signal)] after:shadow-[0_0_0_1px_var(--line-strong)] after:content-[''] after:transition-transform after:duration-700 group-hover:[transform:rotate(-2deg)_scale(1.025)] group-hover:before:[transform:translate3d(-10px,-8px,0)_scale(1.15)] group-hover:after:[transform:translate3d(12px,7px,0)_scale(0.86)] [&_i]:absolute [&_i]:h-[22px] [&_i]:w-[22px] [&_i]:rounded-full [&_i]:border-4 [&_i]:border-[var(--panel)] [&_i]:bg-[var(--inquiry)] [&_i]:shadow-[0_0_0_1px_var(--line-strong)] [&_i]:transition-transform [&_i]:duration-700 [&_i:nth-child(1)]:left-[45%] [&_i:nth-child(1)]:top-[60%] group-hover:[&_i:nth-child(1)]:[transform:translate3d(5px,-16px,0)_scale(1.18)] [&_i:nth-child(2)]:right-[15%] [&_i:nth-child(2)]:top-[18%] [&_i:nth-child(2)]:bg-[var(--signal)] group-hover:[&_i:nth-child(2)]:[transform:translate3d(-13px,10px,0)_scale(0.9)] [&_b]:absolute [&_b]:bottom-3 [&_b]:left-[10%] [&_b]:h-[22px] [&_b]:w-[22px] [&_b]:rounded-full [&_b]:border-4 [&_b]:border-[var(--panel)] [&_b]:bg-[var(--inquiry)] [&_b]:shadow-[0_0_0_1px_var(--line-strong)] [&_b]:transition-transform [&_b]:duration-700 group-hover:[&_b]:[transform:translate3d(18px,-5px,0)_scale(1.08)]" aria-hidden="true"><i /><i /><i /><b /></div>
            <h3>Complex ideas freeze.</h3>
            <p>Processes like the electron transport chain become one crowded still image.</p>
          </article>
          <article className="bento-item group relative col-span-4 flex min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--inquiry)] p-[clamp(28px,4vw,54px)] text-[#f8f9ff] [transform-style:preserve-3d] transition-[transform,border-color] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] hover:[transform:translateY(-6px)_rotateX(1deg)] hover:border-[var(--line-strong)] max-[767px]:col-span-1 [&>svg]:relative [&>svg]:z-[2] [&>svg]:h-7 [&>svg]:w-7 [&>svg]:text-[#f8f9ff] [&>svg]:transition-transform [&>svg]:duration-[650ms] group-hover:[&>svg]:[transform:translate3d(7px,-5px,0)_scale(1.12)] [&_h3]:relative [&_h3]:mb-0 [&_h3]:mt-auto [&_h3]:font-[var(--display)] [&_h3]:text-[clamp(2rem,3.4vw,4rem)] [&_h3]:leading-[0.98] [&>p]:relative [&>p]:mb-0 [&>p]:mt-[14px] [&>p]:leading-[1.45] [&>p]:text-[rgba(248,249,255,0.72)]">
            <Users aria-hidden="true" />
            <div className="absolute right-[34px] top-[46px] grid h-[150px] w-[150px] place-items-center [&_i]:absolute [&_i]:scale-[0.42] [&_i]:rounded-full [&_i]:border [&_i]:border-[rgba(248,249,255,0.64)] [&_i]:opacity-[0.14] [&_i]:transition-[opacity,transform] [&_i]:duration-[680ms] [&_i]:ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:[&_i]:scale-100 group-hover:[&_i]:opacity-[0.62] [&_i:nth-child(1)]:h-[52px] [&_i:nth-child(1)]:w-[52px] [&_i:nth-child(2)]:h-[98px] [&_i:nth-child(2)]:w-[98px] [&_i:nth-child(2)]:delay-[70ms] [&_i:nth-child(3)]:h-36 [&_i:nth-child(3)]:w-36 [&_i:nth-child(3)]:delay-[140ms]" aria-hidden="true"><i /><i /><i /></div>
            <h3>Attention has moved on.</h3>
            <p>Classrooms compete with the most visually engaging technology students own.</p>
          </article>
          <article className="bento-item group relative col-span-8 flex min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-[clamp(28px,4vw,54px)] [transform-style:preserve-3d] transition-[transform,border-color] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] hover:[transform:translateY(-6px)_rotateX(1deg)] hover:border-[var(--line-strong)] max-[767px]:col-span-1 [&_h3]:relative [&_h3]:mb-0 [&_h3]:mt-auto [&_h3]:font-[var(--display)] [&_h3]:text-[clamp(2rem,3.4vw,4rem)] [&_h3]:leading-[0.98] [&>p]:relative [&>p]:mb-0 [&>p]:mt-[14px] [&>p]:leading-[1.45] [&>p]:text-[var(--text-soft)]">
            <div className="absolute right-[5%] top-[34px] grid h-[190px] w-[min(58%,480px)] origin-center place-items-center rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] p-6 text-center font-[var(--mono)] text-xs uppercase text-[var(--text-soft)] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:[transform:translate3d(-8px,5px,0)_rotateY(-5deg)_scale(1.02)] max-[767px]:right-[7%] max-[767px]:w-[86%] [&>span]:transition-[opacity,transform] [&>span]:duration-[650ms] group-hover:[&>span]:-translate-y-2 group-hover:[&>span]:opacity-[0.12]" aria-hidden="true">
              <span>Close your eyes and picture it.</span>
              <div className="absolute inset-[22px] opacity-0 transition-opacity duration-[420ms] group-hover:opacity-100 [&_i]:absolute [&_i]:left-[8%] [&_i]:block [&_i]:h-1 [&_i]:origin-left [&_i]:scale-x-0 [&_i]:bg-[var(--signal)] [&_i]:transition-transform [&_i]:duration-700 group-hover:[&_i]:scale-x-100 [&_i:nth-child(1)]:top-[18%] [&_i:nth-child(1)]:w-[42%] [&_i:nth-child(2)]:top-[34%] [&_i:nth-child(2)]:w-[30%] [&_i:nth-child(2)]:delay-80 [&_i:nth-child(3)]:top-1/2 [&_i:nth-child(3)]:w-[37%] [&_i:nth-child(3)]:delay-150 [&_b]:absolute [&_b]:right-[8%] [&_b]:block [&_b]:h-[52px] [&_b]:w-[52px] [&_b]:scale-0 [&_b]:rounded-full [&_b]:bg-[var(--signal)] [&_b]:transition-transform [&_b]:duration-700 group-hover:[&_b]:scale-100 [&_b:nth-of-type(1)]:top-[12%] [&_b:nth-of-type(1)]:bg-[var(--inquiry)] [&_b:nth-of-type(2)]:bottom-[4%] [&_b:nth-of-type(2)]:right-[27%] [&_b:nth-of-type(2)]:delay-[130ms]"><i /><i /><i /><b /><b /></div>
            </div>
            <h3>Students are told to imagine the missing picture.</h3>
            <p>If the concept was never made visible, there may be nothing there to see.</p>
          </article>
        </div>
      </section>

      <section className="statement-section flex min-h-dvh items-center bg-[var(--page-deep)] px-[max(20px,6vw)] py-[clamp(110px,15vw,220px)] max-[767px]:min-h-[780px] max-[767px]:px-[18px] max-[767px]:py-[110px]">
        <p className="m-0 max-w-[1320px] font-[var(--display)] text-[clamp(3.2rem,7.8vw,8rem)] font-[760] leading-[1.02] max-[767px]:text-[clamp(3rem,13.2vw,5rem)]">
          {statement.split(" ").map((word, index) => (
            <span className="statement-word will-change-[opacity]" key={`${word}-${index}`}>{word} </span>
          ))}
        </p>
      </section>

      <section id="product" ref={horizontalSection} className="relative overflow-hidden bg-[var(--page)]">
        <div ref={horizontalTrack} className="flex min-h-dvh w-max max-[767px]:w-full max-[767px]:flex-col">
          {chapters.map(({ verb, title, body, icon: Icon, tone, visual }) => (
            <article className={`relative flex min-h-dvh w-screen flex-[0_0_100vw] items-end overflow-hidden px-[max(24px,7vw)] py-[clamp(100px,10vw,150px)] max-[767px]:min-h-[760px] max-[767px]:w-full max-[767px]:basis-auto max-[767px]:px-5 max-[767px]:pb-[70px] max-[767px]:pt-[100px] [&>div:last-child]:relative [&>div:last-child]:z-[2] [&>div:last-child]:max-w-[900px] [&_p]:mb-[26px] [&_p]:mt-0 [&_p]:font-[var(--mono)] [&_p]:text-[13px] [&_p]:uppercase [&_h2]:m-0 [&_h2]:max-w-[920px] [&_h2]:font-[var(--display)] [&_h2]:text-[clamp(3.8rem,8vw,8.8rem)] [&_h2]:font-[850] [&_h2]:leading-[0.9] max-[767px]:[&_h2]:text-[clamp(3.6rem,15vw,5.2rem)] [&>div:last-child>span]:mt-[30px] [&>div:last-child>span]:block [&>div:last-child>span]:max-w-[560px] [&>div:last-child>span]:text-[clamp(17px,1.6vw,22px)] [&>div:last-child>span]:leading-[1.5] [&>div:last-child>span]:opacity-[0.68] ${tone}`} key={verb}>
              <JourneyVisual type={visual} />
              <Icon className="absolute left-[7vw] top-[12vh] h-auto w-[clamp(34px,4vw,58px)] max-[767px]:left-5 max-[767px]:top-[38px]" aria-hidden="true" />
              <div>
                <p>{verb}</p>
                <h2>{title}</h2>
                <span>{body}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] gap-[clamp(70px,9vw,150px)] bg-[var(--page-deep)] px-[max(20px,5vw)] py-[clamp(110px,14vw,210px)] max-[1000px]:grid-cols-1 max-[767px]:px-4 max-[767px]:py-[100px]">
        <div className="sticky top-[140px] self-start max-[1000px]:static [&_h2]:m-0 [&_h2]:font-[var(--display)] [&_h2]:text-[clamp(3.4rem,8vw,8.6rem)] [&_h2]:font-[840] [&_h2]:leading-[0.92] [&_h2]:tracking-normal max-[767px]:[&_h2]:text-[clamp(3rem,14vw,4.6rem)] [&_p]:mb-0 [&_p]:mt-8 [&_p]:max-w-[620px] [&_p]:text-[clamp(17px,1.5vw,21px)] [&_p]:leading-[1.55] [&_p]:text-[var(--text-soft)]">
          <h2>Not a fancy drawing app.</h2>
          <p>Imagine changes the classroom from a prepared slideshow into a live shared explanation.</p>
        </div>
        <div className="flex min-h-[760px] gap-2 max-[1000px]:min-h-[680px] max-[767px]:min-h-0 max-[767px]:flex-col">
          <article className={accordionPanelClass} data-reveal>
            <div className="relative flex h-[55%] min-h-[280px] w-full items-center justify-center gap-[9px] [transform-style:preserve-3d] [transform:rotateX(58deg)_rotateZ(-18deg)] max-[767px]:min-h-[300px] [&_span]:h-[58px] [&_span]:w-[58px] [&_span]:rounded-lg [&_span]:border [&_span]:border-[var(--line-strong)] [&_span]:bg-[var(--signal)] [&_span]:shadow-[0_18px_36px_var(--shadow)] [&_i]:h-0.5 [&_i]:w-[30px] [&_i]:bg-[var(--line-strong)]" aria-hidden="true">
              <span /><i /><span /><i /><span />
            </div>
            <div><AudioLines aria-hidden="true" /><h3>Voice</h3><p>Captures teaching as it happens.</p></div>
          </article>
          <article className={accordionPanelClass} data-reveal>
            <div className="relative flex h-[55%] min-h-[280px] w-full items-center justify-center gap-4 [perspective:700px] [transform-style:preserve-3d] max-[767px]:min-h-[300px] [&>span]:grid [&>span]:h-[180px] [&>span]:w-[100px] [&>span]:content-end [&>span]:gap-[9px] [&>span]:rounded-lg [&>span]:border [&>span]:border-[var(--line-strong)] [&>span]:bg-[var(--panel-strong)] [&>span]:p-4 [&>span]:[transform:rotateY(16deg)] [&>span:last-child]:[transform:rotateY(-16deg)] [&_i]:h-[14px] [&_i]:bg-[var(--inquiry)] [&>span:last-child_i]:bg-[var(--signal)] [&>b]:h-[120px] [&>b]:w-px [&>b]:bg-[var(--line-strong)]" aria-hidden="true">
              <span><i /><i /><i /></span><b /><span><i /><i /></span>
            </div>
            <div><GitCompareArrows aria-hidden="true" /><h3>Reasoning</h3><p>Selects the right structure for the idea.</p></div>
          </article>
          <article className={accordionPanelClass} data-reveal>
            <div className="relative h-[55%] min-h-[280px] w-full [perspective:800px] [transform-style:preserve-3d] max-[767px]:min-h-[300px]" aria-hidden="true">
              <div className="absolute left-[6%] top-[38%] flex items-center gap-[5px] [&_i]:h-[42px] [&_i]:w-1 [&_i]:scale-y-[0.45] [&_i]:rounded-full [&_i]:bg-[var(--signal)] [&_i]:transition-transform [&_i]:duration-[650ms] [&_i]:ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:[&_i]:scale-y-100 [&_i:nth-child(2)]:h-[74px] [&_i:nth-child(2)]:delay-[60ms] [&_i:nth-child(3)]:h-[104px] [&_i:nth-child(3)]:delay-[120ms] [&_i:nth-child(4)]:h-[68px] [&_i:nth-child(4)]:delay-[180ms] [&_i:nth-child(5)]:h-9 [&_i:nth-child(5)]:delay-[240ms]"><i /><i /><i /><i /><i /></div>
              <span className="absolute left-[27%] top-1/2 h-px w-1/5 origin-left scale-x-25 bg-[var(--line-strong)] transition-transform duration-[720ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-x-100" />
              <div className="absolute right-[3%] top-[8%] h-[70%] w-1/2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-strong)] p-5 shadow-[0_20px_40px_var(--shadow)] [transform:rotateY(-12deg)_translateZ(0)] transition-transform duration-[760ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:[transform:rotateY(0)_translate3d(-8px,-6px,24px)] [&>span]:block [&>span]:origin-left [&>span]:scale-x-[0.55] [&>span]:rounded-full [&>span]:bg-[var(--line-strong)] [&>span]:transition-transform [&>span]:duration-[650ms] [&>span]:ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:[&>span]:scale-x-100">
                <span className="h-2 w-[58%] !bg-[var(--signal)]" />
                <span className="mt-3 h-1 w-[82%] delay-[90ms]" />
                <span className="mt-3 h-1 w-[56%] delay-150" />
                <div className="absolute bottom-[14%] left-[14%] right-[14%] h-[44%] [&_i]:absolute [&_i]:h-[34px] [&_i]:w-[34px] [&_i]:scale-[0.65] [&_i]:rounded-full [&_i]:bg-[var(--inquiry)] [&_i]:transition-transform [&_i]:duration-[650ms] group-hover:[&_i]:scale-100 [&_i:nth-child(1)]:left-[8%] [&_i:nth-child(1)]:top-[6%] [&_i:nth-child(2)]:bottom-[6%] [&_i:nth-child(2)]:right-[7%] [&_i:nth-child(2)]:bg-[var(--signal)] [&_i:nth-child(2)]:delay-150 [&_b]:absolute [&_b]:left-[21%] [&_b]:top-1/2 [&_b]:h-px [&_b]:w-[62%] [&_b]:origin-left [&_b]:scale-x-[0.35] [&_b]:bg-[var(--line-strong)] [&_b]:transition-transform [&_b]:duration-[650ms] group-hover:[&_b]:scale-x-100 [&_b:nth-of-type(2)]:rotate-[28deg] [&_b:nth-of-type(2)]:delay-[120ms]"><i /><i /><i /><b /><b /></div>
              </div>
            </div>
            <div><Sparkles aria-hidden="true" /><h3>Visuals</h3><p>Composes a shared canvas in real time.</p></div>
          </article>
        </div>
      </section>

      <section className="bg-[var(--page-deep)] px-[max(20px,5vw)] py-[clamp(110px,14vw,210px)] max-[767px]:px-4 max-[767px]:py-[100px]">
        <div className={sectionIntroClass} data-reveal>
          <h2>When students do better, schools do better.</h2>
          <p>Imagine turns teacher time and student attention into outcomes a school can measure.</p>
        </div>
        <div className="impact-flow mt-[clamp(72px,9vw,130px)] grid grid-cols-6 border-y border-[var(--line-strong)] max-[1000px]:grid-cols-3 max-[767px]:grid-cols-1" aria-label="School impact pathway">
          {impactSteps.map((step, index) => (
            <div className="impact-step relative flex min-h-[250px] flex-col justify-between border-r border-[var(--line)] px-[18px] pb-7 pt-6 last:border-r-0 max-[1000px]:[&:nth-child(3)]:border-r-0 max-[1000px]:[&:nth-child(-n+3)]:border-b max-[1000px]:[&:nth-child(-n+3)]:border-[var(--line)] max-[767px]:min-h-[150px] max-[767px]:border-r-0 max-[767px]:border-b max-[767px]:border-[var(--line)] max-[767px]:last:border-b-0 [&>span]:font-[var(--mono)] [&>span]:text-[11px] [&>span]:text-[var(--text-soft)] [&>strong]:max-w-[150px] [&>strong]:font-[var(--display)] [&>strong]:text-[clamp(1.45rem,2.3vw,2.6rem)] [&>strong]:leading-[0.98] [&>svg]:absolute [&>svg]:right-[18px] [&>svg]:top-7 [&>svg]:w-[18px] [&>svg]:-rotate-90 [&>svg]:text-[var(--signal)] max-[767px]:[&>svg]:transform-none" key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
              {index < impactSteps.length - 1 && <ArrowDown aria-hidden="true" />}
            </div>
          ))}
        </div>
      </section>

      <section id="business" className="bg-[var(--page)] px-[max(20px,5vw)] py-[clamp(110px,14vw,210px)] max-[767px]:px-4 max-[767px]:py-[100px]">
        <div className={`${sectionIntroClass} max-w-[1080px]`} data-reveal>
          <h2>Simple pricing. Strong school economics.</h2>
          <p>Schools buy flexible teacher licenses under one contract. Individual educators can start on their own.</p>
        </div>
        <div className="mt-[clamp(70px,9vw,130px)] grid grid-cols-12 gap-3 max-[767px]:grid-cols-1">
          <article className="relative col-span-7 flex min-h-[430px] flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--signal)] p-[clamp(28px,4vw,52px)] text-[var(--signal-ink)] max-[767px]:col-span-1 max-[767px]:min-h-[460px] [&>svg]:h-[34px] [&>svg]:w-[34px] [&>span]:mt-6 [&>span]:font-[var(--mono)] [&>span]:text-[11px] [&>span]:uppercase [&>div]:mt-auto [&_strong]:block [&_strong]:font-[var(--display)] [&_strong]:text-[clamp(5.5rem,10vw,11rem)] [&_strong]:leading-[0.72] [&_small]:mt-[18px] [&_small]:block [&_small]:text-[15px] [&_small]:font-[760] [&>p]:mb-0 [&>p]:mt-[26px] [&>p]:max-w-[520px] [&>p]:leading-[1.5] [&>p]:opacity-[0.72]" data-reveal>
            <School aria-hidden="true" />
            <span>School plan</span>
            <div><strong>$100</strong><small>/ teacher / month</small></div>
            <p>Choose the number of licenses. Negotiate and manage them under one school contract.</p>
          </article>
          <article className="relative col-span-5 flex min-h-[430px] flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--inquiry)] p-[clamp(28px,4vw,52px)] text-[#f8f9ff] max-[767px]:col-span-1 max-[767px]:min-h-[460px] [&>svg]:h-[34px] [&>svg]:w-[34px] [&>span]:mt-6 [&>span]:font-[var(--mono)] [&>span]:text-[11px] [&>span]:uppercase [&>div]:mt-auto [&_strong]:block [&_strong]:font-[var(--display)] [&_strong]:text-[clamp(5.5rem,10vw,11rem)] [&_strong]:leading-[0.72] [&_small]:mt-[18px] [&_small]:block [&_small]:text-[15px] [&_small]:font-[760] [&>p]:mb-0 [&>p]:mt-[26px] [&>p]:max-w-[520px] [&>p]:leading-[1.5] [&>p]:opacity-[0.72]" data-reveal>
            <GraduationCap aria-hidden="true" />
            <span>Individual plan</span>
            <div><strong>$39</strong><small>/ month</small></div>
            <p>A flexible entry point for teachers who want to bring Imagine into their own classroom.</p>
          </article>
          <article className="relative col-span-full grid min-h-[360px] grid-cols-[minmax(260px,0.55fr)_minmax(0,1.45fr)] items-center gap-[clamp(40px,8vw,120px)] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] p-[clamp(28px,4vw,52px)] max-[767px]:col-span-1 max-[767px]:grid-cols-1" data-reveal>
            <div className="grid aspect-square w-[min(310px,100%)] place-items-center rounded-full border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--signal)_12%,transparent)] max-[767px]:w-[230px] [&_span]:font-[var(--display)] [&_span]:text-[clamp(4.4rem,8vw,8rem)] [&_span]:font-[880] [&_span]:tracking-[-0.08em]" aria-hidden="true"><span>93%</span></div>
            <div className="[&>span]:mt-6 [&>span]:font-[var(--mono)] [&>span]:text-[11px] [&>span]:uppercase [&_h3]:mb-0 [&_h3]:mt-6 [&_h3]:max-w-[760px] [&_h3]:font-[var(--display)] [&_h3]:text-[clamp(2.8rem,5.5vw,6rem)] [&_h3]:leading-[0.95] [&_p]:mb-0 [&_p]:mt-6 [&_p]:max-w-[660px] [&_p]:text-lg [&_p]:leading-[1.5] [&_p]:text-[var(--text-soft)]">
              <span>School plan unit economics</span>
              <h3>About $7 in monthly model cost.</h3>
              <p>Voice-to-text, language, and visual generation leave more than 90% gross margin at school-plan pricing.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="grid grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] gap-[clamp(70px,10vw,160px)] bg-[var(--page-deep)] px-[max(20px,5vw)] py-[clamp(110px,14vw,210px)] max-[1000px]:grid-cols-1 max-[767px]:px-4 max-[767px]:py-[100px]">
        <div className={`${sectionIntroClass} sticky top-[140px] self-start max-[1000px]:static`} data-reveal>
          <h2>Start where adoption can move faster.</h2>
          <p>Tuition-paying schools have the resources and incentive to test ambitious educational technology.</p>
          <div className="mt-9 inline-flex items-center gap-3 rounded-full border border-[var(--line-strong)] px-[18px] py-[14px] font-[760] text-[var(--signal)] [&_svg]:w-5"><Building2 aria-hidden="true" /> Innovative private schools</div>
        </div>
        <div className="flex min-h-[650px] flex-col justify-center rounded-lg border border-[var(--line)] bg-[var(--panel)] p-[clamp(34px,5vw,70px)] max-[767px]:min-h-[570px] max-[767px]:px-[18px] max-[767px]:py-[26px] [&>p]:mx-auto [&>p]:mb-0 [&>p]:mt-12 [&>p]:max-w-[520px] [&>p]:text-center [&>p]:text-lg [&>p]:leading-[1.5] [&>p]:text-[var(--text-soft)]" data-reveal>
          <div className="grid justify-items-center gap-[18px] [&_span]:w-[min(100%,470px)] [&_span]:rounded-lg [&_span]:border [&_span]:border-[var(--line-strong)] [&_span]:bg-[var(--panel-strong)] [&_span]:px-7 [&_span]:py-[22px] [&_span]:text-center [&_span]:font-[var(--display)] [&_span]:text-[clamp(1.8rem,3.4vw,3.8rem)] [&_span]:font-[820] [&_span:nth-of-type(2)]:w-[min(88%,420px)] [&_span:nth-of-type(2)]:bg-[var(--inquiry)] [&_span:nth-of-type(2)]:text-[#f8f9ff] [&_span:nth-of-type(3)]:w-[min(72%,350px)] [&_span:nth-of-type(3)]:bg-[var(--signal)] [&_span:nth-of-type(3)]:text-[var(--signal-ink)] [&_svg]:text-[var(--signal)]">
            <span>Teacher</span><ArrowDown aria-hidden="true" />
            <span>Department chair</span><ArrowDown aria-hidden="true" />
            <span>Principal</span>
          </div>
          <p>Every successful classroom becomes a live demo for the next decision-maker.</p>
        </div>
        <div className="col-span-full flex items-center justify-center gap-[clamp(12px,2.4vw,34px)] border-y border-[var(--line-strong)] px-6 py-[60px] text-center font-[var(--display)] text-[clamp(1.5rem,3.4vw,4rem)] font-extrabold max-[767px]:flex-wrap [&_i]:not-italic [&_i]:text-[var(--text-soft)] [&_strong]:text-[var(--signal)]" data-reveal>
          <span>Pilots</span><i>+</i><span>Results</span><i>+</i><span>Case studies</span><i>=</i><strong>Expansion</strong>
        </div>
      </section>

      <section className="grid min-h-dvh grid-cols-2 max-[767px]:min-h-0 max-[767px]:grid-cols-1">
        <div className="flex min-w-0 flex-col justify-center bg-[var(--signal)] px-[max(24px,6vw)] py-[clamp(70px,8vw,130px)] text-[var(--signal-ink)] max-[767px]:min-h-[660px] max-[767px]:px-[18px] max-[767px]:py-[90px] [&_svg]:h-[46px] [&_svg]:w-[46px] [&>span]:mt-6 [&>span]:font-[var(--mono)] [&>span]:text-[11px] [&>span]:uppercase [&_strong]:mt-[34px] [&_strong]:font-[var(--display)] [&_strong]:text-[clamp(7rem,15vw,16rem)] [&_strong]:font-black [&_strong]:leading-[0.7] [&_strong]:tracking-[-0.08em] max-[767px]:[&_strong]:text-[clamp(6.5rem,31vw,10rem)] [&_p]:mb-0 [&_p]:mt-[34px] [&_p]:text-xl [&_p]:font-[740]" data-reveal>
          <CircleDollarSign aria-hidden="true" />
          <span>Total addressable market</span>
          <strong>$2.4B</strong>
          <p>in annual opportunity</p>
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-0 bg-[var(--panel)] px-[max(24px,6vw)] py-[clamp(70px,8vw,130px)] max-[767px]:min-h-[660px] max-[767px]:px-[18px] max-[767px]:py-[90px] [&>div]:flex [&>div]:items-baseline [&>div]:justify-between [&>div]:gap-6 [&>div]:border-b [&>div]:border-[var(--line)] [&>div]:py-[25px] [&_span]:m-0 [&_span]:text-[var(--text-soft)] [&_strong]:text-right [&_strong]:font-[var(--display)] [&_strong]:text-[clamp(2rem,4vw,4.8rem)] [&_strong]:leading-[0.9] [&>.tam-total]:mt-[26px] [&>.tam-total]:border-0 [&>.tam-total]:text-[var(--signal)] [&>p]:mb-0 [&>p]:mt-6 [&>p]:max-w-[540px] [&>p]:text-[13px] [&>p]:leading-[1.5] [&>p]:text-[var(--text-soft)]" data-reveal>
          <div><span>Reachable teachers</span><strong>2.15M</strong></div>
          <div><span>Effective monthly license</span><strong>~$93</strong></div>
          <div><span>Months</span><strong>12</strong></div>
          <div className="tam-total"><span>Estimated TAM</span><strong>≈ $2.4B</strong></div>
          <p>Uses the pitch estimate and an effective contracted rate below the $100 school list price.</p>
        </div>
      </section>

      <section className="bg-[var(--page)] px-[max(20px,5vw)] py-[clamp(110px,14vw,210px)] max-[767px]:overflow-hidden max-[767px]:px-4 max-[767px]:py-[100px]">
        <div className={sectionIntroClass} data-reveal>
          <h2>A new category of educational technology.</h2>
          <p>Other tools make visuals. Imagineer makes them live, inside the discussion, as teaching happens.</p>
        </div>
        <div className="mt-[clamp(70px,9vw,130px)] overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] max-[767px]:-mr-4 max-[767px]:rounded-r-none max-[767px]:border-r-0" data-reveal>
          <table className="w-full min-w-[760px] border-collapse [&_th]:h-[86px] [&_th]:border-b [&_th]:border-[var(--line)] [&_th]:px-[22px] [&_th]:py-[18px] [&_th]:text-center [&_td]:h-[86px] [&_td]:border-b [&_td]:border-[var(--line)] [&_td]:px-[22px] [&_td]:py-[18px] [&_td]:text-center [&_thead_th]:font-[var(--mono)] [&_thead_th]:text-[10px] [&_thead_th]:font-medium [&_thead_th]:uppercase [&_thead_th]:text-[var(--text-soft)] [&_th:first-child]:w-[28%] [&_th:first-child]:text-left [&_tbody_th]:font-[var(--display)] [&_tbody_th]:text-[clamp(1.4rem,2.2vw,2.4rem)] [&_tbody_tr:last-child_th]:border-b-0 [&_tbody_tr:last-child_td]:border-b-0">
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
                <tr className={competitor.featured ? "bg-[var(--signal)] text-[var(--signal-ink)] [&_span]:text-[var(--signal-ink)]" : undefined} key={competitor.name}>
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

      <section className="grid min-h-[850px] grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] bg-[var(--page-deep)] max-[767px]:min-h-0 max-[767px]:grid-cols-1">
        <div className="relative min-h-[680px] overflow-hidden border-r border-[var(--line)] max-[767px]:min-h-[620px] max-[767px]:border-b max-[767px]:border-r-0" aria-hidden="true">
          <div className="absolute inset-0 rotate-[-11deg] scale-[1.2] bg-[linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] bg-[length:64px_64px] opacity-45" />
          <span className="absolute left-1/2 top-1/2 h-[230px] w-[230px] -translate-x-1/2 -translate-y-1/2 animate-map-pulse rounded-full border border-[var(--signal)]" />
          <span className="absolute left-1/2 top-1/2 h-[410px] w-[410px] -translate-x-1/2 -translate-y-1/2 animate-map-pulse rounded-full border border-[var(--signal)] [animation-delay:0.7s]" />
          <MapPin className="absolute left-1/2 top-1/2 z-[2] h-[68px] w-[68px] text-[var(--signal)] [filter:drop-shadow(0_14px_22px_var(--shadow))] [transform:translate(-50%,-80%)]" />
          <strong className="absolute left-1/2 top-[calc(50%+55px)] z-[2] -translate-x-1/2 whitespace-nowrap font-[var(--display)] text-[clamp(2rem,4vw,4.5rem)]">Durham, NC</strong>
        </div>
        <div className={`${sectionIntroClass} flex max-w-none flex-col justify-center px-[max(24px,6vw)] py-[clamp(70px,8vw,130px)] max-[767px]:px-[18px] max-[767px]:py-[90px] [&>span]:mt-[52px] [&>span]:font-[var(--mono)] [&>span]:text-[11px] [&>span]:uppercase [&>span]:text-[var(--signal)]`} data-reveal>
          <h2>The first customers are already nearby.</h2>
          <p>Durham Academy is minutes from campus. Land a few schools, run live demos, prove outcomes, and let teachers carry the story forward.</p>
          <span>Triangle, North Carolina</span>
        </div>
      </section>

      <section className="bg-[var(--page)] px-[max(20px,5vw)] py-[clamp(110px,14vw,210px)] max-[767px]:px-4 max-[767px]:py-[100px]">
        <div className={`${sectionIntroClass} max-w-[1100px]`} data-reveal>
          <h2>Education is the beachhead. Understanding is the product.</h2>
          <p>Once spoken ideas can animate themselves, the canvas can follow anyone explaining something hard.</p>
        </div>
        <div className="mt-[clamp(80px,10vw,150px)] grid grid-cols-4 border-y border-[var(--line-strong)] max-[1000px]:grid-cols-2 max-[767px]:grid-cols-1 [&_article]:flex [&_article]:min-h-[290px] [&_article]:flex-col [&_article]:justify-between [&_article]:border-r [&_article]:border-[var(--line)] [&_article]:p-7 [&_article:last-child]:border-r-0 max-[1000px]:[&_article:nth-child(2)]:border-r-0 max-[1000px]:[&_article:nth-child(-n+2)]:border-b max-[767px]:[&_article]:min-h-[210px] max-[767px]:[&_article]:border-b max-[767px]:[&_article]:border-r-0 max-[767px]:[&_article:last-child]:border-b-0 [&_svg]:h-[30px] [&_svg]:w-[30px] [&_svg]:text-[var(--signal)] [&_span]:font-[var(--display)] [&_span]:text-[clamp(1.8rem,3vw,3.4rem)] [&_span]:font-extrabold">
          <article data-reveal><School aria-hidden="true" /><span>Classroom</span></article>
          <article data-reveal><GraduationCap aria-hidden="true" /><span>Lecture hall</span></article>
          <article data-reveal><Building2 aria-hidden="true" /><span>Boardroom</span></article>
          <article data-reveal><Presentation aria-hidden="true" /><span>Keynote stage</span></article>
        </div>
      </section>

      <section id="team" className="bg-[var(--page-deep)] px-[max(20px,5vw)] py-[clamp(110px,14vw,210px)] max-[767px]:px-4 max-[767px]:py-[100px]">
        <div className={sectionIntroClass} data-reveal>
          <h2>Built by the students who lived the problem.</h2>
          <p>Three NCSSM students building the classroom tool they wished they had.</p>
        </div>
        <div className="mt-[clamp(70px,9vw,130px)] grid grid-cols-3 gap-3 max-[767px]:grid-cols-1">
          {team.map((member) => (
            <article className="flex min-h-[510px] flex-col rounded-lg border border-[var(--line)] bg-[var(--panel)] p-[clamp(28px,3vw,44px)] max-[767px]:min-h-[460px] [&>div]:grid [&>div]:h-[92px] [&>div]:w-[92px] [&>div]:place-items-center [&>div]:rounded-full [&>div]:bg-[var(--signal)] [&>div]:font-[var(--display)] [&>div]:text-[30px] [&>div]:font-[880] [&>div]:text-[var(--signal-ink)] [&:nth-child(2)>div]:bg-[var(--inquiry)] [&:nth-child(2)>div]:text-[#f8f9ff] [&:nth-child(3)>div]:bg-[var(--paper)] [&:nth-child(3)>div]:text-[#151915] [&>span]:mt-auto [&>span]:font-[var(--mono)] [&>span]:text-[11px] [&>span]:uppercase [&>span]:text-[var(--signal)] [&_h3]:mb-0 [&_h3]:mt-[14px] [&_h3]:font-[var(--display)] [&_h3]:text-[clamp(3rem,5vw,5.4rem)] [&_h3]:leading-[0.9] [&_p]:mb-0 [&_p]:mt-[22px] [&_p]:max-w-[380px] [&_p]:leading-[1.5] [&_p]:text-[var(--text-soft)]" data-reveal key={member.name}>
              <div aria-hidden="true">{member.initials}</div>
              <span>{member.role}</span>
              <h3>{member.name}</h3>
              <p>{member.note}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="relative flex min-h-dvh flex-col justify-end overflow-hidden bg-[var(--signal)] px-[max(24px,5vw)] pb-[42px] pt-[120px] text-[var(--signal-ink)] max-[767px]:min-h-[760px] max-[767px]:px-[18px] max-[767px]:pb-[30px] max-[767px]:pt-[100px] [&>p]:mb-[26px] [&>p]:mt-0 [&>p]:text-[clamp(20px,2vw,28px)] [&>p]:font-[650] [&_h2]:relative [&_h2]:z-[2] [&_h2]:m-0 [&_h2]:font-[var(--display)] [&_h2]:text-[clamp(4.5rem,12vw,12.5rem)] [&_h2]:font-[840] [&_h2]:leading-[0.82] max-[767px]:[&_h2]:text-[clamp(3.4rem,15.5vw,5.4rem)]">
        <div className="absolute right-[-10vw] top-[-16vw] h-[58vw] w-[58vw] animate-journey-spin-reverse rounded-full border border-[rgba(17,22,11,0.28)] before:absolute before:inset-[16%] before:rounded-full before:border before:border-[rgba(17,22,11,0.28)] before:content-[''] after:absolute after:inset-[34%] after:rounded-full after:border after:border-[rgba(17,22,11,0.28)] after:content-[''] max-[767px]:right-[-48%] max-[767px]:top-[-8%] max-[767px]:h-[130vw] max-[767px]:w-[130vw] [&_i]:absolute [&_i]:h-[18px] [&_i]:w-[18px] [&_i]:rounded-full [&_i]:bg-[var(--signal-ink)] [&_i:nth-child(1)]:left-[28%] [&_i:nth-child(1)]:top-[8%] [&_i:nth-child(2)]:bottom-[22%] [&_i:nth-child(2)]:right-[8%] [&_i:nth-child(3)]:bottom-[4%] [&_i:nth-child(3)]:left-[38%] [&_b]:absolute [&_b]:left-[-1%] [&_b]:top-[43%] [&_b]:h-[18px] [&_b]:w-[18px] [&_b]:rounded-full [&_b]:bg-[var(--signal-ink)]" aria-hidden="true"><i /><i /><i /><b /></div>
        <p>Instead of closing your eyes and imagining it,</p>
        <h2>IMAGINEER IT.</h2>
        <Link href="/canvas" className="group relative z-4 mt-[38px] inline-flex min-h-[58px] items-center gap-[18px] self-end rounded-full bg-[var(--signal-ink)] py-[7px] pl-6 pr-2 font-[760] text-[var(--signal)] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[3px] max-[767px]:mt-[54px] max-[767px]:w-full max-[767px]:justify-between max-[767px]:self-auto">
          Try Imagine <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--signal)] text-[var(--signal-ink)] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-rotate-[28deg]"><ArrowRight className="h-6 w-6" aria-hidden="true" /></span>
        </Link>
        <div className="relative z-[3] mt-[70px] flex items-center justify-between border-t border-[rgba(17,22,11,0.28)] pt-[22px] text-[13px] max-[767px]:flex-col max-[767px]:items-start max-[767px]:gap-[14px]">
          <span>Visual understanding, composed live.</span>
          <Link href="#top">Back to top</Link>
        </div>
      </footer>
    </main>
  );
}
