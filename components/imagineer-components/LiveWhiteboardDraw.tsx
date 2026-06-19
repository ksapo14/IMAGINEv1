'use client';

import { useEffect, useState } from 'react';

type LiveWhiteboardDrawProps = {
  /** Notes that appear one-by-one, as if placed live while speaking. */
  bullets?: string[];
  /** Caption above the board. */
  title?: string;
  className?: string;
};

/**
 * Slide cue: "An animation of a whiteboard drawing things is running, with some
 * text bullet points next to it showing what the speaker is saying."
 * The core product moment: a sketch draws itself (marker stroke) while notes
 * are placed in real time. A "Listening" badge shows IMAGINEv1 is live.
 */
export default function LiveWhiteboardDraw({
  bullets = ['Protons pump across the membrane', 'Electrons tumble down the chain', 'Energy → ATP'],
  title = 'IMAGINEv1 — live',
  className = '',
}: LiveWhiteboardDrawProps) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    setVisibleCount(0);
    const timers = bullets.map((_, i) =>
      setTimeout(() => setVisibleCount((c) => Math.max(c, i + 1)), 900 + i * 850),
    );
    return () => timers.forEach(clearTimeout);
  }, [bullets]);

  return (
    <div className={`flex h-full w-full items-center justify-center bg-[#0A1530] p-6 ${className}`}>
      <style>{`
        @keyframes lwb-draw { to { stroke-dashoffset: 0; } }
        .lwb-stroke { stroke-dasharray: 600; stroke-dashoffset: 600; animation: lwb-draw 3s ease-out forwards; }
        .lwb-stroke-2 { stroke-dasharray: 300; stroke-dashoffset: 300; animation: lwb-draw 2s ease-out 1.2s forwards; }
        @keyframes lwb-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        .lwb-dot { animation: lwb-pulse 1.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .lwb-stroke, .lwb-stroke-2 { animation: none; stroke-dashoffset: 0; }
          .lwb-dot { animation: none; }
        }
      `}</style>

      <div className="flex w-full max-w-3xl flex-col gap-4 sm:flex-row">
        {/* Whiteboard */}
        <div className="relative flex-1 overflow-hidden rounded-2xl bg-[#F7F5EF] p-4 shadow-lg">
          {/* Listening badge — placed inside with padding so it never clips */}
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#0A1530] px-3 py-1">
            <span className="lwb-dot inline-block h-2 w-2 rounded-full bg-[#4CC4F0]" />
            <span className="text-xs font-semibold tracking-wide text-[#CFE3F5]">{title}</span>
          </div>

          <svg viewBox="0 0 260 150" className="w-full" aria-label="Sketch drawing itself">
            <path
              d="M30 110 C 60 40, 120 40, 150 110 C 180 175, 210 60, 235 95"
              fill="none"
              stroke="#0A1530"
              strokeWidth="3.5"
              strokeLinecap="round"
              className="lwb-stroke"
            />
            <path
              d="M40 130 L 220 130"
              fill="none"
              stroke="#F5B546"
              strokeWidth="3"
              strokeLinecap="round"
              className="lwb-stroke-2"
            />
          </svg>
        </div>

        {/* Live notes */}
        <ul className="flex flex-1 flex-col justify-center gap-3">
          {bullets.map((b, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-[#E6EEF9] transition-all duration-500 ease-out"
              style={{
                opacity: i < visibleCount ? 1 : 0,
                transform: i < visibleCount ? 'translateX(0)' : 'translateX(14px)',
              }}
            >
              <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-[#F5B546]" />
              <span className="text-sm sm:text-base">{b}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
