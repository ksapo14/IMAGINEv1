'use client';

import { useEffect, useState } from 'react';

type ClassroomSpeechBubblesProps = {
  /** Short student remarks that float up and turn into sketches. */
  remarks?: string[];
  className?: string;
};

/**
 * Slide cue: "an animated classroom where student speech bubbles float up and turn
 * into quick sketches on the board in real time."
 * Imagine listens to the whole room — not just the teacher.
 */
export default function ClassroomSpeechBubbles({
  remarks = ['What if pressure rises?', 'Does gravity factor in?', 'Show the forces'],
  className = '',
}: ClassroomSpeechBubblesProps) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % remarks.length), 2600);
    return () => clearInterval(id);
  }, [remarks.length]);

  return (
    <div className={`flex h-full w-full items-center justify-center bg-[#0A1530] p-6 ${className}`}>
      <style>{`
        @keyframes csb-rise {
          0%   { transform: translateY(20px); opacity: 0; }
          20%  { opacity: 1; }
          70%  { transform: translateY(-70px); opacity: 1; }
          100% { transform: translateY(-110px); opacity: 0; }
        }
        .csb-bubble { animation: csb-rise 2.6s ease-in-out forwards; }
        @keyframes csb-draw { to { stroke-dashoffset: 0; } }
        .csb-sketch { stroke-dasharray: 260; stroke-dashoffset: 260; animation: csb-draw 1.8s ease-out forwards; }
        @media (prefers-reduced-motion: reduce) {
          .csb-bubble { animation: none; opacity: 1; }
          .csb-sketch { animation: none; stroke-dashoffset: 0; }
        }
      `}</style>

      <div className="flex w-full max-w-2xl flex-col items-center gap-4">
        {/* Board */}
        <div className="relative h-44 w-full overflow-hidden rounded-2xl bg-[#F7F5EF] shadow-lg">
          <svg key={`s-${active}`} viewBox="0 0 320 150" className="h-full w-full" aria-hidden="true">
            <path
              d="M60 110 Q 120 30 180 110 T 280 90"
              fill="none"
              stroke="#0A1530"
              strokeWidth="3"
              strokeLinecap="round"
              className="csb-sketch"
            />
          </svg>

          {/* Floating speech bubble */}
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <div
              key={`b-${active}`}
              className="csb-bubble rounded-2xl bg-[#0A1530] px-4 py-2 text-sm font-medium text-[#CFE3F5] shadow"
            >
              {remarks[active]}
            </div>
          </div>
        </div>

        <p className="text-sm text-[#9FB2D0]">It lives in the classroom, and it belongs to everyone in it.</p>
      </div>
    </div>
  );
}
