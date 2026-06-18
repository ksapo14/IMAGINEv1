"use client";

import { memo } from "react";
import {
  MapPin,
  Users,
} from "lucide-react";
import { ElectronTransportChain } from "@/components/electron-transport-chain";

type PitchVisualProps = {
  componentKey: string;
  title: string;
  subtitle: string;
  bullets: string[];
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
      <PlaceholderLabel>Target schools</PlaceholderLabel>
      <h1 className="mt-6 max-w-5xl text-[clamp(3rem,7vw,7rem)] font-semibold leading-[0.92] tracking-normal text-[#121417]">
        {title}
      </h1>
      <p className="mt-5 text-[clamp(1.1rem,2vw,1.55rem)] leading-8 text-[#4d4a43]">
        {subtitle}
      </p>
      <div className="pitch-stagger mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {schoolNames.map((name) => (
          <div key={name} className="grid min-h-24 place-items-center border border-[#e4ddd0] bg-white px-4 text-center text-xl font-semibold text-[#15171a] shadow-[0_12px_30px_rgba(20,22,28,0.06)]">
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
  const people = [
    { name: "Vivaan", role: "CEO" },
    { name: "Jackson", role: "CFO" },
    { name: "Krish", role: "CTO" },
  ];

  return (
    <div className="pitch-enter w-full max-w-7xl">
      <PlaceholderLabel>Founding team</PlaceholderLabel>
      <div className="pitch-stagger mt-10 grid gap-5 md:grid-cols-3">
        {people.map((person, index) => {
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
                <Users className={visible ? "pitch-float h-24 w-24" : "h-24 w-24"} strokeWidth={1.2} aria-hidden="true" />
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

export const PitchVisual = memo(function PitchVisual(props: PitchVisualProps) {
  switch (props.componentKey) {
    case "teachers-burn-hours":
      return <TeachersBurnHours />;
    case "electron-transport-chain":
      return <ElectronTransportChain />;
    case "product-intro":
      return <ProductIntro {...props} />;
    case "live-whiteboard":
      return <LiveWhiteboard {...props} />;
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
      return <MarketTotal {...props} />;
    case "durham-map":
      return <DurhamMap {...props} />;
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
