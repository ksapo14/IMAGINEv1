"use client";

import { memo, type ReactNode } from "react";
import {
  ArrowDown,
  Check,
  MapPin,
  Monitor,
  Smartphone,
  X,
} from "lucide-react";
import { ElectronTransportChain } from "@/components/electron-transport-chain";
import {
  ClassroomSpeechBubbles,
  CompetitorComparisonTable as AnimatedCompetitorComparisonTable,
  DurhamMapPin,
  LiveWhiteboardDraw,
  SplitScreenContrast,
  TamCounter,
} from "@/components/imagineer-components";

type PitchVisualProps = {
  componentKey: string;
  title: string;
  subtitle: string;
  bullets: string[];
  imageUrl?: string;
  imagePrompt?: string;
};

const flowSteps = ["Focus", "Understanding", "Scores", "Rankings", "Enrollment", "Revenue"];
const schoolNames = [
  "Durham Academy",
  "Duke School",
  "Cary Academy",
  "Ravenscroft",
  "Latin",
  "Forsyth",
  "Charlotte Country Day",
  "Providence Day",
];
const founderProfiles = [
  {
    name: "Vivaan",
    role: "CEO",
    photo: "/vivaan.png",
  },
  {
    name: "Jackson",
    role: "CFO",
    photo: "/jackson.png",
  },
  {
    name: "Krish",
    role: "CTO",
    photo: "/krish.jpg",
  },
];

const useCaseDetails = {
  classroom: {
    label: "Classroom image",
    imageUrl: "/classroom.png",
    accent: "#1d8067",
    background: "linear-gradient(135deg, #f4fbf8 0%, #ffffff 58%, #e6f5ef 100%)",
  },
  lecture: {
    label: "Lecture hall image",
    imageUrl: "/lecture_hall.png",
    accent: "#3846a7",
    background: "linear-gradient(135deg, #f5f7ff 0%, #ffffff 56%, #e8ebff 100%)",
  },
  boardroom: {
    label: "Boardroom image",
    imageUrl: "/boardroom.png",
    accent: "#8b5c16",
    background: "linear-gradient(135deg, #fff9ed 0%, #ffffff 58%, #f5ead7 100%)",
  },
  keynote: {
    label: "Keynote stage image",
    imageUrl: "/keynote_stage.png",
    accent: "#bd3d2f",
    background: "linear-gradient(135deg, #fff6f4 0%, #ffffff 55%, #f9e4df 100%)",
  },
};

function getValueFlowActiveIndex(componentKey: string) {
  const activeKey = componentKey.replace("value-flow-", "");
  return flowSteps.findIndex((step) => step.toLowerCase() === activeKey);
}

function getPricingStage(componentKey: string) {
  if (componentKey === "pricing-model-teacher") {
    return 2;
  }

  if (componentKey === "pricing-model-school") {
    return 1;
  }

  return 0;
}

function PlaceholderLabel({ children }: { children: string }) {
  return (
    <div className="pitch-enter inline-flex rounded-full border border-[#dfd8ca] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#7d6b4c]">
      {children}
    </div>
  );
}

function ThemedAnimationStage({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`pitch-enter pitch-themed-animation h-[min(82vh,900px)] w-full max-w-[1500px] overflow-hidden border border-[#e4ddd0] bg-white shadow-[0_16px_48px_rgba(20,22,28,0.08)] ${className}`}>
      <style>{`
        .pitch-themed-animation,
        .pitch-themed-animation > div {
          background: #fff !important;
          color: #121417 !important;
          font-family: inherit !important;
        }

        .pitch-themed-animation > div {
          padding: clamp(1.25rem, 3.8vw, 3.75rem) !important;
        }

        .pitch-themed-animation [class~="max-w-md"],
        .pitch-themed-animation [class~="max-w-lg"],
        .pitch-themed-animation [class~="max-w-xl"],
        .pitch-themed-animation [class~="max-w-2xl"],
        .pitch-themed-animation [class~="max-w-3xl"],
        .pitch-themed-animation [class~="max-w-4xl"] {
          max-width: min(94vw, 1180px) !important;
        }

        .pitch-themed-animation [class~="h-44"] {
          height: min(44vh, 390px) !important;
        }

        .pitch-themed-animation [class~="h-64"] {
          height: min(56vh, 500px) !important;
        }

        .pitch-themed-animation [class~="gap-2"],
        .pitch-themed-animation [class~="gap-3"],
        .pitch-themed-animation [class~="gap-4"] {
          gap: clamp(1rem, 1.8vw, 2rem) !important;
        }

        .pitch-themed-animation [class~="p-4"],
        .pitch-themed-animation [class~="p-5"],
        .pitch-themed-animation [class~="p-6"] {
          padding: clamp(1.25rem, 2.3vw, 2.6rem) !important;
        }

        .pitch-themed-animation [class~="px-3"],
        .pitch-themed-animation [class~="px-4"],
        .pitch-themed-animation [class~="px-5"] {
          padding-left: clamp(1rem, 1.8vw, 2rem) !important;
          padding-right: clamp(1rem, 1.8vw, 2rem) !important;
        }

        .pitch-themed-animation [class~="py-1"],
        .pitch-themed-animation [class~="py-2"],
        .pitch-themed-animation [class~="py-3"] {
          padding-top: clamp(0.55rem, 1vw, 1rem) !important;
          padding-bottom: clamp(0.55rem, 1vw, 1rem) !important;
        }

        .pitch-themed-animation [class~="text-[10px]"],
        .pitch-themed-animation [class~="text-[11px]"],
        .pitch-themed-animation [class~="text-xs"] {
          font-size: clamp(0.95rem, 1.2vw, 1.18rem) !important;
          line-height: 1.35 !important;
        }

        .pitch-themed-animation [class~="text-sm"],
        .pitch-themed-animation [class~="text-base"] {
          font-size: clamp(1.08rem, 1.55vw, 1.5rem) !important;
          line-height: 1.45 !important;
        }

        .pitch-themed-animation [class~="text-lg"],
        .pitch-themed-animation [class~="text-xl"] {
          font-size: clamp(1.35rem, 2vw, 2rem) !important;
          line-height: 1.25 !important;
        }

        .pitch-themed-animation [class~="text-2xl"],
        .pitch-themed-animation [class~="text-3xl"] {
          font-size: clamp(2rem, 3.2vw, 3.45rem) !important;
          line-height: 1.08 !important;
        }

        .pitch-themed-animation [class~="text-4xl"],
        .pitch-themed-animation [class~="text-5xl"] {
          font-size: clamp(3.2rem, 6vw, 6.5rem) !important;
          line-height: 0.98 !important;
        }

        .pitch-themed-animation [class~="text-6xl"],
        .pitch-themed-animation [class~="text-7xl"],
        .pitch-themed-animation [class~="text-8xl"] {
          font-size: clamp(5rem, 10.5vw, 9.8rem) !important;
          line-height: 0.9 !important;
        }

        .pitch-themed-animation svg {
          max-width: 100% !important;
        }

        .pitch-themed-animation [class*="bg-[#0A1530]"],
        .pitch-themed-animation [class*="bg-[#0E1A33]"],
        .pitch-themed-animation [class*="bg-[#10213F]"],
        .pitch-themed-animation [class*="bg-[#16294D]"] {
          background-color: #fff !important;
        }

        .pitch-themed-animation [class*="bg-[#F7F5EF]"],
        .pitch-themed-animation [class*="bg-[#F5B546]"] {
          background-color: #fbfaf7 !important;
        }

        .pitch-themed-animation [class*="text-[#F7F5EF]"],
        .pitch-themed-animation [class*="text-[#E6EEF9]"],
        .pitch-themed-animation [class*="text-[#CFE3F5]"],
        .pitch-themed-animation [class*="text-[#9FB2D0]"],
        .pitch-themed-animation [class*="text-[#6F86AD]"] {
          color: #121417 !important;
        }

        .pitch-themed-animation [class*="text-[#4CC4F0]"] {
          color: #1d8067 !important;
        }

        .pitch-themed-animation [class*="text-[#F5B546]"] {
          color: #8b5c16 !important;
        }

        .pitch-themed-animation [class*="border-[#1C2C4D]"],
        .pitch-themed-animation [class*="border-[#26416E]"] {
          border-color: #e4ddd0 !important;
        }

        .pitch-themed-animation [class*="rounded-2xl"],
        .pitch-themed-animation [class*="rounded-xl"] {
          border-radius: 0 !important;
        }

        .pitch-themed-animation [style*="#0A1530"],
        .pitch-themed-animation [style*="#0E1A33"],
        .pitch-themed-animation [style*="#10213F"],
        .pitch-themed-animation [style*="#1C2C4D"] {
          background-color: #fff !important;
          border-color: #e4ddd0 !important;
          color: #121417 !important;
          box-shadow: 0 12px 34px rgba(20, 22, 28, 0.07) !important;
        }

        .pitch-themed-animation [style*="#4CC4F0"] {
          color: #1d8067 !important;
          border-color: #1d8067 !important;
        }

        .pitch-themed-animation svg text {
          fill: #121417 !important;
          font-family: inherit !important;
        }

        .pitch-first-kind > div:not(style) > div > div:first-child {
          background-color: #0e1a33 !important;
        }

        .pitch-first-kind > div:not(style) > div > div:first-child * {
          color: #cfe3f5 !important;
        }

        .pitch-first-kind > div:not(style) > div > div:not(:first-child) {
          background-color: #fff !important;
        }

        .pitch-first-kind > div:not(style) > div > div:not(:first-child) * {
          color: #121417 !important;
        }

        .pitch-first-kind > div:not(style) > div > div:last-child {
          background-color: #10213f !important;
        }

        .pitch-first-kind > div:not(style) > div > div:last-child * {
          color: #4cc4f0 !important;
        }
      `}</style>
      {children}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="pitch-pop flex min-h-32 flex-col justify-between border border-[#e8e1d5] bg-white p-5 shadow-[0_12px_36px_rgba(20,22,28,0.08)]">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#8b7654]">{label}</p>
      <p className="text-[clamp(2.5rem,5vw,5rem)] font-semibold leading-none text-[#121417]">
        {value}
      </p>
    </div>
  );
}

function ProductIntro({ title, subtitle, bullets }: PitchVisualProps) {
  return (
    <div className="pitch-enter grid w-full max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
      <div className="pitch-stagger">
        <PlaceholderLabel>Product</PlaceholderLabel>
        <h1 className="mt-7 text-[clamp(4rem,10vw,10rem)] font-semibold leading-[0.86] tracking-normal text-[#101214]">
          {title}
        </h1>
        <p className="mt-7 max-w-3xl text-[clamp(1.1rem,2vw,1.7rem)] leading-8 text-[#42413c]">
          {subtitle}
        </p>
      </div>
      <div className="pitch-stagger grid gap-4">
        {bullets.map((bullet, index) => (
          <div
            key={bullet}
            className="flex items-center gap-5 border border-[#e8e1d5] bg-white p-6 shadow-[0_14px_40px_rgba(20,22,28,0.08)]"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#101214] text-lg font-semibold text-white">
              {index + 1}
            </span>
            <p className="text-[clamp(1.1rem,2vw,1.7rem)] font-medium leading-7 text-[#181a1d]">
              {bullet}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveWhiteboard({ title, subtitle, bullets }: PitchVisualProps) {
  return (
    <div className="pitch-enter grid w-full max-w-7xl gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
      <div className="pitch-pop relative aspect-[16/9] overflow-hidden border border-[#ded8cc] bg-white shadow-[0_18px_55px_rgba(20,22,28,0.1)]">
        <div className="absolute left-[7%] top-[8%] rounded-full bg-[#101214] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white">
          Example: explain a volcano
        </div>
        <div className="pitch-draw absolute left-[8%] top-[24%] h-1 w-[44%] bg-[#111318]" />
        <div className="pitch-draw absolute left-[8%] top-[35%] h-1 w-[58%] bg-[#111318]" style={{ animationDelay: "160ms" }} />
        <div className="pitch-draw absolute left-[8%] top-[46%] h-1 w-[40%] bg-[#111318]" style={{ animationDelay: "320ms" }} />
        <div className="pitch-pop absolute bottom-[16%] left-[10%] h-32 w-32 rounded-full border-4 border-[#2e7d64]" style={{ animationDelay: "420ms" }} />
        <div className="pitch-pop absolute bottom-[16%] left-[29%] h-32 w-32 rounded-full border-4 border-[#bd3d2f]" style={{ animationDelay: "520ms" }} />
        <div className="pitch-draw absolute bottom-[23%] left-[21%] h-1 w-[18%] bg-[#151515]" style={{ animationDelay: "620ms" }} />
        <div className="pitch-pop absolute bottom-[10%] right-[8%] max-w-[36%] border border-[#ded8cc] bg-white px-4 py-3 text-sm font-medium leading-5 text-[#242424] shadow-[0_12px_28px_rgba(20,22,28,0.1)]">
          Magma rises, pressure builds, then the volcano releases energy.
        </div>
        <div className="pitch-pulse-soft absolute right-[10%] top-[24%] grid h-40 w-40 place-items-center rounded-full border border-[#d9b05f] bg-[#fff8ea] text-center text-sm font-semibold uppercase tracking-[0.18em] text-[#8c6720]">
          generating live
        </div>
      </div>
      <div className="pitch-stagger">
        <PlaceholderLabel>Live visual placeholder</PlaceholderLabel>
        <h1 className="mt-6 text-[clamp(3rem,7vw,7rem)] font-semibold leading-[0.94] tracking-normal text-[#121417]">
          {title}
        </h1>
        <p className="mt-5 text-[clamp(1rem,1.8vw,1.45rem)] leading-7 text-[#4d4a43]">
          {subtitle}
        </p>
        <ul className="pitch-stagger mt-8 space-y-4">
          {[
            "Teacher says: pressure builds below the surface",
            "Imagine draws: chamber, vent, eruption path",
            ...bullets.slice(0, 1),
          ].map((bullet) => (
            <li key={bullet} className="border-l-2 border-[#1d8067] pl-4 text-xl font-medium text-[#181a1d]">
              {bullet}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ValueFlow({ title, subtitle, componentKey }: PitchVisualProps) {
  const activeIndex = getValueFlowActiveIndex(componentKey);

  return (
    <div className="pitch-enter w-full max-w-7xl">
      <PlaceholderLabel>Value flywheel</PlaceholderLabel>
      <h1 className="mt-6 max-w-5xl text-[clamp(3.4rem,8vw,8rem)] font-semibold leading-[0.9] tracking-normal text-[#121417]">
        {title}
      </h1>
      <p className="mt-5 max-w-3xl text-[clamp(1.1rem,2vw,1.6rem)] leading-8 text-[#4d4a43]">
        {subtitle}
      </p>
      <div className="pitch-stagger mt-12 grid gap-3 md:grid-cols-6">
        {flowSteps.map((step, index) => (
          <div
            key={step}
            className={`relative min-h-40 border p-4 shadow-[0_12px_34px_rgba(20,22,28,0.07)] transition-all duration-500 ${
              index === activeIndex
                ? "scale-105 border-[#101214] bg-[#101214] text-white"
                : index < activeIndex
                  ? "border-[#d7cdbb] bg-[#f8f5ef] text-[#141619]"
                  : "border-[#e4ddd0] bg-white text-[#141619]"
            }`}
          >
            <p className={`text-sm font-semibold ${index === activeIndex ? "text-[#e9d7b8]" : "text-[#8b7654]"}`}>
              {String(index + 1).padStart(2, "0")}
            </p>
            <p className="mt-10 text-2xl font-semibold leading-7">{step}</p>
            {index < flowSteps.length - 1 ? (
              <span className={`absolute -right-3 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 rotate-45 border-r-2 border-t-2 md:block ${
                index === activeIndex ? "border-[#101214]" : "border-[#111318]"
              }`} />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function PricingModel({ title, componentKey }: PitchVisualProps) {
  const stage = getPricingStage(componentKey);

  return (
    <div className="pitch-enter grid w-full max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
      <div className="pitch-stagger">
        <PlaceholderLabel>Pricing</PlaceholderLabel>
        <h1 className="mt-6 text-[clamp(3.4rem,8vw,8rem)] font-semibold leading-[0.9] tracking-normal text-[#121417]">
          {title}
        </h1>
      </div>
      <div className="pitch-stagger grid gap-5 sm:grid-cols-2">
        {stage >= 1 ? (
          <StatTile label="Schools" value="$100" />
        ) : (
          <div className="min-h-32 border border-dashed border-[#e0d8c9] bg-white p-5 text-sm font-semibold uppercase tracking-[0.18em] text-[#b1a58f]">
            School price reveal
          </div>
        )}
        {stage >= 2 ? (
          <StatTile label="Teachers" value="$39" />
        ) : (
          <div className="min-h-32 border border-dashed border-[#e0d8c9] bg-white p-5 text-sm font-semibold uppercase tracking-[0.18em] text-[#b1a58f]">
            Teacher price reveal
          </div>
        )}
      </div>
    </div>
  );
}

function MarginChart({ title, subtitle }: PitchVisualProps) {
  return (
    <div className="pitch-enter grid w-full max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
      <div className="pitch-stagger">
        <PlaceholderLabel>Unit economics</PlaceholderLabel>
        <h1 className="mt-6 text-[clamp(3.2rem,7vw,7rem)] font-semibold leading-[0.92] tracking-normal text-[#121417]">
          {title}
        </h1>
        <p className="mt-6 text-[clamp(1.1rem,2vw,1.6rem)] leading-8 text-[#4d4a43]">
          {subtitle}
        </p>
      </div>
      <div className="pitch-stagger space-y-6">
        <div>
          <div className="mb-2 flex justify-between text-sm font-semibold uppercase tracking-[0.18em] text-[#6f6558]">
            <span>Price</span>
            <span>$100</span>
          </div>
          <div className="pitch-draw h-16 bg-[#111318]" />
        </div>
        <div>
          <div className="mb-2 flex justify-between text-sm font-semibold uppercase tracking-[0.18em] text-[#6f6558]">
            <span>Cost</span>
            <span>$7</span>
          </div>
          <div className="pitch-draw h-16 w-[7%] min-w-10 bg-[#1d8067]" />
        </div>
        <div className="pitch-pop border border-[#e4ddd0] bg-white p-6 text-[clamp(2.5rem,6vw,6rem)] font-semibold leading-none text-[#121417] shadow-[0_14px_40px_rgba(20,22,28,0.08)]">
          &gt;90%
          <p className="mt-3 text-base font-semibold uppercase tracking-[0.22em] text-[#8b7654]">
            estimated gross margin
          </p>
        </div>
      </div>
    </div>
  );
}

function SchoolCollage({ title, subtitle }: PitchVisualProps) {
  return (
    <div className="pitch-enter w-full max-w-7xl">
      <style>{`
        @keyframes schoolCardFall {
          0% {
            opacity: 0;
            transform: translateY(-70px) rotate(-2deg);
          }
          70% {
            opacity: 1;
            transform: translateY(7px) rotate(0.5deg);
          }
          100% {
            opacity: 1;
            transform: translateY(0) rotate(0deg);
          }
        }
        .school-card-fall {
          animation: schoolCardFall 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .school-card-fall {
            animation: none;
          }
        }
      `}</style>
      <PlaceholderLabel>Target schools</PlaceholderLabel>
      <h1 className="mt-6 max-w-5xl text-[clamp(3rem,7vw,7rem)] font-semibold leading-[0.92] tracking-normal text-[#121417]">
        {title}
      </h1>
      <p className="mt-5 text-[clamp(1.1rem,2vw,1.55rem)] leading-8 text-[#4d4a43]">
        {subtitle}
      </p>
      <div className="pitch-stagger mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {schoolNames.map((name, index) => (
          <div
            key={name}
            className="school-card-fall grid min-h-24 place-items-center border border-[#e4ddd0] bg-white px-4 text-center text-xl font-semibold text-[#15171a] shadow-[0_12px_30px_rgba(20,22,28,0.06)]"
            style={{ animationDelay: `${index * 95}ms` }}
          >
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketTotal({ title, subtitle }: PitchVisualProps) {
  return (
    <div className="pitch-enter grid w-full max-w-7xl place-items-center text-center">
      <PlaceholderLabel>Market size</PlaceholderLabel>
      <h1 className="pitch-pop mt-8 text-[clamp(4rem,12vw,13rem)] font-black leading-[0.8] tracking-normal text-[#101214]">
        {title}
      </h1>
      <p className="mt-8 text-[clamp(1.5rem,4vw,4rem)] font-semibold leading-none text-[#8b5c16]">
        {subtitle}
      </p>
    </div>
  );
}

function FutureAnimationPlaceholder({ title, subtitle, bullets }: PitchVisualProps) {
  return (
    <div className="pitch-enter grid w-full max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
      <div className="pitch-stagger">
        <PlaceholderLabel>Animation placeholder</PlaceholderLabel>
        <h1 className="mt-6 text-[clamp(3rem,7vw,7rem)] font-semibold leading-[0.92] tracking-normal text-[#121417]">
          {title}
        </h1>
        <p className="mt-6 text-[clamp(1.1rem,2vw,1.55rem)] leading-8 text-[#4d4a43]">
          {subtitle}
        </p>
      </div>
      <div className="pitch-stagger grid gap-4">
        {bullets.map((bullet, index) => (
          <div
            key={bullet}
            className="flex items-center gap-5 border border-dashed border-[#d7cdbb] bg-white p-5 shadow-[0_12px_30px_rgba(20,22,28,0.06)]"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#f2eadc] text-base font-semibold text-[#8b5c16]">
              {index + 1}
            </span>
            <p className="text-[clamp(1rem,1.7vw,1.4rem)] font-medium leading-7 text-[#181a1d]">
              {bullet}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EngagementContrast({ title, subtitle }: PitchVisualProps) {
  return (
    <div className="pitch-enter grid w-full max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
      <div className="pitch-stagger">
        <PlaceholderLabel>Problem</PlaceholderLabel>
        <h1 className="mt-6 text-[clamp(3.2rem,7vw,7rem)] font-semibold leading-[0.92] tracking-normal text-[#121417]">
          {title}
        </h1>
        <p className="mt-6 text-[clamp(1.1rem,2vw,1.55rem)] leading-8 text-[#4d4a43]">
          {subtitle}
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="pitch-pop border border-[#d9d3c7] bg-white p-6 shadow-[0_14px_42px_rgba(20,22,28,0.08)]">
          <div className="grid aspect-[9/16] place-items-center border-8 border-[#111318] bg-[#f7fbff]">
            <div className="grid gap-4 text-center">
              <Smartphone className="mx-auto h-20 w-20 text-[#3846a7]" strokeWidth={1.4} aria-hidden="true" />
              <p className="text-3xl font-semibold text-[#121417]">Phones</p>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6b7280]">motion / color / feedback</p>
            </div>
          </div>
        </div>
        <div className="pitch-pop border border-[#e4ddd0] bg-[#fbfaf7] p-6 shadow-[0_14px_42px_rgba(20,22,28,0.06)]" style={{ animationDelay: "140ms" }}>
          <div className="grid aspect-[9/16] place-items-center border border-[#d6cfc2] bg-white">
            <div className="grid gap-4 text-center">
              <Monitor className="mx-auto h-20 w-20 text-[#8b7654]" strokeWidth={1.4} aria-hidden="true" />
              <p className="text-3xl font-semibold text-[#121417]">Classroom</p>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8b7654]">static / slow / passive</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StaticSlides({ title, subtitle, bullets }: PitchVisualProps) {
  return (
    <div className="pitch-enter grid w-full max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
      <div className="pitch-stagger">
        <PlaceholderLabel>Old classroom</PlaceholderLabel>
        <h1 className="mt-6 text-[clamp(3rem,7vw,7rem)] font-semibold leading-[0.92] tracking-normal text-[#121417]">
          {title}
        </h1>
        <p className="mt-6 text-[clamp(1.1rem,2vw,1.55rem)] leading-8 text-[#4d4a43]">
          {subtitle}
        </p>
      </div>
      <div className="pitch-pop border border-[#d9d3c7] bg-white p-7 shadow-[0_16px_48px_rgba(20,22,28,0.08)]">
        <div className="aspect-[16/9] border border-[#d9d3c7] bg-[#fbfaf7] p-7">
          <div className="h-8 w-2/3 bg-[#111318]" />
          <div className="mt-8 grid gap-4">
            <div className="h-4 w-full bg-[#d7cdbb]" />
            <div className="h-4 w-11/12 bg-[#d7cdbb]" />
            <div className="h-4 w-10/12 bg-[#d7cdbb]" />
            <div className="h-4 w-3/4 bg-[#d7cdbb]" />
          </div>
          <div className="mt-8 grid grid-cols-[1fr_0.75fr] gap-6">
            <div className="grid aspect-[4/3] place-items-center border border-dashed border-[#b9ae9d] text-center text-sm font-semibold uppercase tracking-[0.16em] text-[#8b7654]">
              frozen diagram
            </div>
            <div className="grid content-start gap-3">
              {bullets.map((bullet) => (
                <div key={bullet} className="border-l-2 border-[#bd3d2f] bg-white px-4 py-3 text-lg font-semibold text-[#181a1d]">
                  {bullet}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SalesFlow({ title, subtitle, stage }: PitchVisualProps & { stage: 1 | 2 | 3 }) {
  const steps = ["Teacher", "Department Chair", "Principal"];

  return (
    <div className="pitch-enter grid w-full max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
      <div className="pitch-stagger">
        <PlaceholderLabel>Distribution</PlaceholderLabel>
        <h1 className="mt-6 text-[clamp(3.2rem,7vw,7rem)] font-semibold leading-[0.92] tracking-normal text-[#121417]">
          {title}
        </h1>
        <p className="mt-6 text-[clamp(1.1rem,2vw,1.55rem)] leading-8 text-[#4d4a43]">
          {subtitle}
        </p>
      </div>
      <div className="pitch-stagger mx-auto grid w-full max-w-xl gap-3">
        {steps.map((step, index) => {
          const visible = index < stage;
          return (
            <div key={step} className="grid gap-3">
              <div className={`grid min-h-28 place-items-center border px-6 text-center text-[clamp(1.6rem,3vw,3rem)] font-semibold shadow-[0_12px_34px_rgba(20,22,28,0.07)] ${
                visible ? "border-[#101214] bg-white text-[#121417]" : "border-dashed border-[#e1d9ca] bg-[#fbfaf7] text-[#b8ad9f]"
              }`}>
                {visible ? step : "Next buyer"}
              </div>
              {index < steps.length - 1 ? (
                <ArrowDown className={`mx-auto h-10 w-10 ${visible ? "text-[#1d8067]" : "text-[#d5ccbd]"}`} strokeWidth={1.8} aria-hidden="true" />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PilotExpansion({ title, subtitle, stage }: PitchVisualProps & { stage: 1 | 2 | 3 | 4 }) {
  const steps = ["Pilots", "Results", "Case Studies"];

  return (
    <div className="pitch-enter w-full max-w-7xl">
      <PlaceholderLabel>Go to market</PlaceholderLabel>
      <h1 className="mt-6 max-w-5xl text-[clamp(3rem,7vw,7rem)] font-semibold leading-[0.92] tracking-normal text-[#121417]">
        {title}
      </h1>
      <p className="mt-5 max-w-3xl text-[clamp(1.1rem,2vw,1.55rem)] leading-8 text-[#4d4a43]">
        {subtitle}
      </p>
      <div className="pitch-stagger mt-12 grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-center">
        {steps.map((step, index) => (
          <div key={step} className="contents">
            <div className={`grid min-h-36 place-items-center border p-5 text-center text-2xl font-semibold shadow-[0_12px_34px_rgba(20,22,28,0.07)] ${
              index < stage ? "border-[#101214] bg-white text-[#121417]" : "border-dashed border-[#e1d9ca] bg-[#fbfaf7] text-[#b8ad9f]"
            }`}>
              {index < stage ? step : "Pending"}
            </div>
            <p className="hidden text-4xl font-semibold text-[#8b7654] md:block">{index === steps.length - 1 ? "=" : "+"}</p>
          </div>
        ))}
        <div className={`grid min-h-36 place-items-center border p-5 text-center text-2xl font-semibold shadow-[0_12px_34px_rgba(20,22,28,0.07)] ${
          stage >= 4 ? "border-[#101214] bg-[#101214] text-white" : "border-dashed border-[#e1d9ca] bg-[#fbfaf7] text-[#b8ad9f]"
        }`}>
          Expansion
        </div>
      </div>
    </div>
  );
}

function TamCalculation({ title, subtitle }: PitchVisualProps) {
  const rows = [
    ["Reachable teacher seats", "2.15M"],
    ["Annual price", "$1,200"],
    ["Total addressable market", "$2.4B"],
  ];

  return (
    <div className="pitch-enter grid w-full max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
      <div className="pitch-stagger">
        <PlaceholderLabel>TAM calculation</PlaceholderLabel>
        <h1 className="mt-6 text-[clamp(3.2rem,7vw,7rem)] font-semibold leading-[0.92] tracking-normal text-[#121417]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-6 text-[clamp(1.1rem,2vw,1.55rem)] leading-8 text-[#4d4a43]">
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="pitch-stagger border border-[#d9d3c7] bg-white p-6 shadow-[0_16px_48px_rgba(20,22,28,0.08)]">
        {rows.map(([label, value], index) => (
          <div key={label} className={`grid grid-cols-[1fr_auto] gap-5 border-b border-[#e4ddd0] px-2 py-5 ${index === rows.length - 1 ? "border-b-0 bg-[#101214] px-5 text-white" : ""}`}>
            <p className="text-[clamp(1.1rem,2vw,1.6rem)] font-medium">{label}</p>
            <p className="text-[clamp(1.5rem,3vw,3rem)] font-semibold leading-none">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompetitiveTable({ title, subtitle }: PitchVisualProps) {
  const rows = [
    ["Canva", true, false, false, false],
    ["Google Slides", true, false, false, false],
    ["ChatGPT", true, false, false, false],
    ["Imagine", true, true, true, true],
  ] as const;

  return (
    <div className="pitch-enter w-full max-w-7xl">
      <PlaceholderLabel>Category</PlaceholderLabel>
      <h1 className="mt-6 max-w-5xl text-[clamp(3rem,7vw,7rem)] font-semibold leading-[0.92] tracking-normal text-[#121417]">
        {title}
      </h1>
      <p className="mt-5 max-w-4xl text-[clamp(1.1rem,2vw,1.55rem)] leading-8 text-[#4d4a43]">
        {subtitle}
      </p>
      <div className="pitch-stagger mt-10 overflow-hidden border border-[#d9d3c7] bg-white shadow-[0_16px_48px_rgba(20,22,28,0.08)]">
        <div className="grid grid-cols-[1.2fr_repeat(4,1fr)] bg-[#101214] text-sm font-semibold uppercase tracking-[0.12em] text-white">
          {["Tool", "Visuals", "Live", "Room", "Zero prep"].map((header) => (
            <div key={header} className="px-4 py-4 text-center">{header}</div>
          ))}
        </div>
        {rows.map((row) => (
          <div key={row[0]} className={`grid grid-cols-[1.2fr_repeat(4,1fr)] border-t border-[#e4ddd0] ${row[0] === "Imagine" ? "bg-[#f4fbf8]" : "bg-white"}`}>
            <div className="px-4 py-5 text-xl font-semibold text-[#121417]">{row[0]}</div>
            {row.slice(1).map((enabled, index) => (
              <div key={`${row[0]}-${index}`} className="grid place-items-center px-4 py-5">
                {enabled ? (
                  <Check className="h-8 w-8 text-[#1d8067]" strokeWidth={2.4} aria-label="Yes" />
                ) : (
                  <X className="h-8 w-8 text-[#bd3d2f]" strokeWidth={2.4} aria-label="No" />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DurhamMap({ title, subtitle }: PitchVisualProps) {
  return (
    <div className="pitch-enter grid w-full max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
      <div className="pitch-stagger">
        <PlaceholderLabel>Beachhead</PlaceholderLabel>
        <h1 className="mt-6 text-[clamp(3.4rem,8vw,8rem)] font-semibold leading-[0.9] tracking-normal text-[#121417]">
          {title}
        </h1>
        <p className="mt-6 text-[clamp(1.15rem,2vw,1.65rem)] leading-8 text-[#4d4a43]">
          {subtitle}
        </p>
      </div>
      <div className="pitch-pop relative aspect-[4/3] overflow-hidden border border-[#e0d8c9] bg-[#f8fbff] shadow-[0_16px_48px_rgba(20,22,28,0.09)]">
        <div className="absolute inset-x-[-10%] top-[28%] h-10 rotate-[-9deg] bg-[#d7e8f4]" />
        <div className="absolute inset-y-[-10%] left-[46%] w-12 rotate-[13deg] bg-[#e4ead7]" />
        <div className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center text-[#bd3d2f]">
          <div className="pitch-pulse-soft grid place-items-center">
            <MapPin className="h-28 w-28 fill-[#bd3d2f] stroke-[#bd3d2f]" aria-hidden="true" />
            <p className="mt-2 text-3xl font-semibold text-[#121417]">Durham, NC</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function UseCaseStage({ title, subtitle, kind }: PitchVisualProps & { kind: string }) {
  const detail = useCaseDetails[kind as keyof typeof useCaseDetails];

  return (
    <div className="pitch-enter grid w-full max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
      <div className="pitch-stagger">
        <PlaceholderLabel>Expansion</PlaceholderLabel>
        <h1 className="mt-6 text-[clamp(4rem,10vw,10rem)] font-semibold leading-[0.86] tracking-normal text-[#121417]">
          {title}
        </h1>
        <p className="mt-7 text-[clamp(1.15rem,2vw,1.7rem)] leading-8 text-[#4d4a43]">
          {subtitle}
        </p>
      </div>
      <div
        className="pitch-pop relative aspect-[4/3] overflow-hidden border border-[#e4ddd0] shadow-[0_16px_48px_rgba(20,22,28,0.08)]"
        style={{ background: detail.background }}
      >
        <img
          src={detail.imageUrl}
          alt={detail.label}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/28 via-transparent to-transparent" />
      </div>
    </div>
  );
}

function TeamStage({ active }: { active: 1 | 2 | 3 }) {
  return (
    <div className="pitch-enter w-full max-w-7xl">
      <PlaceholderLabel>Founding team</PlaceholderLabel>
      <div className="pitch-stagger mt-10 grid gap-5 md:grid-cols-3">
        {founderProfiles.map((person, index) => {
          const visible = index < active;
          return (
            <div
              key={person.name}
              className={`min-h-[26rem] border p-6 shadow-[0_14px_42px_rgba(20,22,28,0.08)] ${
                visible
                  ? "border-[#d7cdbb] bg-white text-[#121417]"
                  : "border-[#efebe3] bg-[#fbfaf7] text-[#b6ad9f]"
              }`}
            >
              <div className={`grid aspect-square place-items-center border border-dashed border-[#d7cdbb] bg-white transition-opacity duration-500 ${
                visible ? "opacity-100" : "opacity-35"
              }`}>
                {visible ? (
                  <img
                    src={person.photo}
                    alt={`${person.name} headshot`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b6ad9f]">
                    Photo pending
                  </span>
                )}
              </div>
              <p className="mt-6 text-4xl font-semibold">{visible ? person.name : "Photo placeholder"}</p>
              <p className="mt-2 text-xl font-medium uppercase tracking-[0.18em] text-[#8b7654]">
                {visible ? person.role : "Pending"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClosingLockup({ title, subtitle }: PitchVisualProps) {
  return (
    <div className="pitch-enter grid w-full max-w-6xl place-items-center text-center">
      <img
        src="/real_imagineer_logo.png"
        alt="Imagineer logo"
        className="pitch-pop max-h-[min(38vh,420px)] w-full max-w-3xl object-contain"
      />
      <h1 className="mt-10 text-[clamp(3.2rem,8vw,8rem)] font-semibold leading-[0.9] tracking-normal text-[#121417]">
        {title}
      </h1>
      <p className="mt-5 text-[clamp(1.25rem,3vw,3rem)] font-medium leading-tight text-[#3d3b36]">
        {subtitle}
      </p>
    </div>
  );
}

function SchoolValue({ title, subtitle, bullets }: PitchVisualProps) {
  return (
    <div className="pitch-enter grid w-full max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
      <div className="pitch-stagger">
        <PlaceholderLabel>School value</PlaceholderLabel>
        <h1 className="mt-6 text-[clamp(3.4rem,8vw,8rem)] font-semibold leading-[0.9] tracking-normal text-[#121417]">
          {title}
        </h1>
        <p className="mt-6 text-[clamp(1.1rem,2vw,1.6rem)] leading-8 text-[#4d4a43]">
          {subtitle}
        </p>
      </div>
      <div className="pitch-stagger grid gap-5">
        {bullets.map((bullet, index) => (
          <div key={bullet} className="flex items-center gap-5 border border-[#e4ddd0] bg-white p-6 shadow-[0_12px_34px_rgba(20,22,28,0.07)]">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#f2eadc] text-2xl font-semibold text-[#8b5c16]">
              {index + 1}
            </span>
            <p className="text-[clamp(1.15rem,2vw,1.7rem)] font-medium leading-7 text-[#15171a]">
              {bullet}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeachersBurnHours() {
  return (
    <div className="pitch-stagger grid w-full max-w-6xl gap-8 bg-white lg:grid-cols-2 lg:items-center">
      <img
        src="/stressed_teacher.png"
        alt="Stressed teacher buried in classroom preparation work"
        className="max-h-[min(68vh,700px)] w-full object-contain"
      />
      <img
        src="/bored_student.png"
        alt="Bored student in a lecture hall"
        className="max-h-[min(68vh,700px)] w-full object-contain"
      />
    </div>
  );
}

function BeakerImage({ imageUrl, imagePrompt }: PitchVisualProps) {
  return (
    <div className="pitch-enter grid w-full place-items-center bg-white px-[clamp(1rem,4vw,4rem)] py-[clamp(1rem,4vh,3rem)]">
      <img
        src={imageUrl}
        alt={imagePrompt || "Beaker demo"}
        className="pitch-pop h-auto max-h-[min(78vh,820px)] w-auto max-w-[min(92vw,1280px)] object-contain"
      />
    </div>
  );
}

export const PitchVisual = memo(function PitchVisual(props: PitchVisualProps) {
  switch (props.componentKey) {
    case "teachers-burn-hours":
      return <TeachersBurnHours />;
    case "phones-vs-classroom":
      return <EngagementContrast {...props} />;
    case "static-slides":
      return <StaticSlides {...props} />;
    case "beaker-image":
      return <BeakerImage {...props} />;
    case "electron-transport-chain":
      return <ElectronTransportChain />;
    case "product-intro":
      return <ProductIntro {...props} />;
    case "live-whiteboard":
      return (
        <ThemedAnimationStage>
          <LiveWhiteboardDraw title={props.title || "IMAGINEv1"} bullets={props.bullets} />
        </ThemedAnimationStage>
      );
    case "split-screen":
      return (
        <ThemedAnimationStage>
          <SplitScreenContrast />
        </ThemedAnimationStage>
      );
    case "discussion":
      return (
        <ThemedAnimationStage>
          <ClassroomSpeechBubbles
            remarks={[
              "So it is like a battery?",
              "Wait, draw the protons",
              "Now I get it",
            ]}
          />
        </ThemedAnimationStage>
      );
    case "sales-flow-teacher":
      return <SalesFlow {...props} stage={1} />;
    case "sales-flow-department-chair":
      return <SalesFlow {...props} stage={2} />;
    case "sales-flow-principal":
      return <SalesFlow {...props} stage={3} />;
    case "pilot-expansion-pilots":
      return <PilotExpansion {...props} stage={1} />;
    case "pilot-expansion-results":
      return <PilotExpansion {...props} stage={2} />;
    case "pilot-expansion-case-studies":
      return <PilotExpansion {...props} stage={3} />;
    case "pilot-expansion-expansion":
      return <PilotExpansion {...props} stage={4} />;
    case "tam-calc":
      return <TamCalculation {...props} />;
    case "competitive-table":
      return (
        <ThemedAnimationStage className="pitch-first-kind">
          <AnimatedCompetitorComparisonTable />
        </ThemedAnimationStage>
      );
    case "school-value":
      return <SchoolValue {...props} />;
    case "value-flow-focus":
    case "value-flow-understanding":
    case "value-flow-scores":
    case "value-flow-rankings":
    case "value-flow-enrollment":
    case "value-flow-revenue":
      return <ValueFlow {...props} />;
    case "pricing-model-intro":
    case "pricing-model-school":
    case "pricing-model-teacher":
      return <PricingModel {...props} />;
    case "margin-chart":
      return <MarginChart {...props} />;
    case "school-collage":
      return <SchoolCollage {...props} />;
    case "market-total":
      return (
        <ThemedAnimationStage>
          <TamCounter
            target={2.4}
            prefix="$"
            suffix="B"
            label="Total addressable market / year"
            aside="Dude. That is a lot of money."
            decimals={1}
          />
        </ThemedAnimationStage>
      );
    case "durham-map":
      return (
        <ThemedAnimationStage>
          <DurhamMapPin />
        </ThemedAnimationStage>
      );
    case "use-case-classroom":
      return <UseCaseStage {...props} kind="classroom" />;
    case "use-case-lecture-hall":
      return <UseCaseStage {...props} kind="lecture" />;
    case "use-case-boardroom":
      return <UseCaseStage {...props} kind="boardroom" />;
    case "use-case-keynote":
      return <UseCaseStage {...props} kind="keynote" />;
    case "team-vivaan":
      return <TeamStage active={1} />;
    case "team-jackson":
      return <TeamStage active={2} />;
    case "team-krish":
      return <TeamStage active={3} />;
    case "closing-lockup":
      return <ClosingLockup {...props} />;
    case "final-thanks":
      return <ClosingLockup {...props} />;
    default:
      return (
        <div className="grid w-full max-w-5xl place-items-center text-center">
          <PlaceholderLabel>Placeholder</PlaceholderLabel>
          <h1 className="mt-6 text-[clamp(3rem,7vw,7rem)] font-semibold leading-[0.92] tracking-normal text-[#121417]">
            {props.title || props.componentKey}
          </h1>
          {props.subtitle ? (
            <p className="mt-5 text-[clamp(1.1rem,2vw,1.6rem)] leading-8 text-[#4d4a43]">
              {props.subtitle}
            </p>
          ) : null}
        </div>
      );
  }
});
