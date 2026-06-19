'use client';

import { useEffect, useState } from 'react';

type DurhamMapPinProps = {
  label?: string;
  note?: string;
  className?: string;
};

/**
 * Slide cue: "a map pin on Durham, NC is displayed ... Durham Academy is ten minutes
 * from our campus." A stylized (non-geographic) map with a pin that drops and ripples.
 */
export default function DurhamMapPin({
  label = 'Durham, NC',
  note = 'Durham Academy — 10 minutes from campus',
  className = '',
}: DurhamMapPinProps) {
  const [dropped, setDropped] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDropped(true), 350);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`flex h-full w-full items-center justify-center bg-[#0A1530] p-6 ${className}`}>
      <style>{`
        @keyframes dmp-ripple {
          0% { transform: scale(0.4); opacity: 0.6; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        .dmp-ripple { animation: dmp-ripple 1.8s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) { .dmp-ripple { animation: none; opacity: 0; } }
      `}</style>

      <div className="relative w-full max-w-lg">
        {/* Abstract map panel */}
        <div className="relative h-64 w-full overflow-hidden rounded-2xl border border-[#1C2C4D] bg-[#0E1A33]">
          {/* faint grid / roads */}
          <svg className="absolute inset-0 h-full w-full opacity-40" aria-hidden="true">
            <defs>
              <pattern id="dmp-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M40 0 L0 0 0 40" fill="none" stroke="#1C2C4D" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dmp-grid)" />
            <path d="M0 180 Q 200 120 500 200" fill="none" stroke="#26416E" strokeWidth="2" />
            <path d="M120 0 Q 160 140 90 300" fill="none" stroke="#26416E" strokeWidth="2" />
          </svg>

          {/* Pin */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
            {/* ripple anchored at pin tip */}
            <div className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-1/2">
              {dropped && <span className="dmp-ripple block h-10 w-10 rounded-full bg-[#4CC4F0]" />}
            </div>

            <svg
              width="40"
              height="52"
              viewBox="0 0 40 52"
              className="relative transition-all duration-500 ease-out"
              style={{
                transform: dropped ? 'translateY(0)' : 'translateY(-40px)',
                opacity: dropped ? 1 : 0,
              }}
              aria-label="Map pin on Durham"
            >
              <path
                d="M20 2 C 30 2, 38 10, 38 20 C 38 33, 20 50, 20 50 C 20 50, 2 33, 2 20 C 2 10, 10 2, 20 2 Z"
                fill="#F5B546"
                stroke="#0A1530"
                strokeWidth="1.5"
              />
              <circle cx="20" cy="20" r="7" fill="#0A1530" />
            </svg>
          </div>
        </div>

        <div className="mt-4 text-center">
          <p className="text-lg font-bold text-[#F7F5EF]">{label}</p>
          <p className="mt-1 text-sm text-[#9FB2D0]">{note}</p>
        </div>
      </div>
    </div>
  );
}
