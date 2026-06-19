'use client';

import { useEffect, useState } from 'react';

type SplitScreenContrastProps = {
  className?: string;
};

/**
 * Slide cue: "an animated split screen, left side a lone student staring at a wall
 * of text, right side the same idea drawing itself to life as a teacher speaks."
 * The "before vs Imagine" contrast. Left stays dead; right comes alive on a loop.
 */
export default function SplitScreenContrast({ className = '' }: SplitScreenContrastProps) {
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCycle((c) => c + 1), 4200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`flex h-full w-full items-stretch justify-center bg-[#0A1530] p-6 ${className}`}>
      <div className="grid w-full max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#1C2C4D]">
        {/* Left: static wall of text */}
        <div className="bg-[#0E1A33] p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#6F86AD]">
            The old way
          </p>
          <div className="space-y-1.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="h-2 rounded bg-[#1C2C4D]"
                style={{ width: `${70 + ((i * 37) % 28)}%` }}
              />
            ))}
          </div>
          <p className="mt-4 text-xs text-[#6F86AD]">Read it. Picture it. Good luck.</p>
        </div>

        {/* Right: idea drawing itself */}
        <div className="bg-[#10213F] p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#4CC4F0]">
            With Imagine
          </p>
          <svg key={cycle} viewBox="0 0 180 120" className="w-full" aria-label="Idea drawing itself">
            <style>{`
              @keyframes ssc-draw { to { stroke-dashoffset: 0; } }
              .ssc-p { stroke-dasharray: 400; stroke-dashoffset: 400; animation: ssc-draw 2.4s ease-out forwards; }
              .ssc-p2 { stroke-dasharray: 200; stroke-dashoffset: 200; animation: ssc-draw 1.6s ease-out 0.9s forwards; }
              @media (prefers-reduced-motion: reduce) {
                .ssc-p, .ssc-p2 { animation: none; stroke-dashoffset: 0; }
              }
            `}</style>
            <path
              d="M20 90 C 40 30, 80 30, 95 80 C 110 130, 140 40, 160 70"
              fill="none"
              stroke="#4CC4F0"
              strokeWidth="3.5"
              strokeLinecap="round"
              className="ssc-p"
            />
            <circle cx="95" cy="80" r="5" fill="#F5B546" className="ssc-p2" />
          </svg>
          <p className="mt-4 text-xs text-[#9FB2D0]">Built with you, out loud, in the room.</p>
        </div>
      </div>
    </div>
  );
}
