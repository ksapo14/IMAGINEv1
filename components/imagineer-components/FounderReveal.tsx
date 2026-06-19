'use client';

import { useEffect, useState } from 'react';

type Founder = {
  name: string;
  role: string;
  /** Optional photo URL. Falls back to initials if omitted. */
  photo?: string;
  tagline?: string;
};

type FounderRevealProps = {
  founders?: Founder[];
  className?: string;
};

/**
 * Slide cue: "(Imagine pops: Vivaan's photo) ... Jackson's photo next to vivaan ...
 * Krish's photo." Three founder cards appear one after another.
 */
export default function FounderReveal({
  founders = [
    { name: 'Vivaan', role: 'CEO' },
    { name: 'Jackson', role: 'CFO' },
    { name: 'Krish', role: 'CTO' },
  ],
  className = '',
}: FounderRevealProps) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
    const timers = founders.map((_, i) => setTimeout(() => setShown((s) => Math.max(s, i + 1)), 500 + i * 650));
    return () => timers.forEach(clearTimeout);
  }, [founders]);

  return (
    <div className={`flex h-full w-full items-center justify-center bg-[#0A1530] p-6 ${className}`}>
      <div className="flex flex-wrap items-stretch justify-center gap-5">
        {founders.map((f, i) => (
          <div
            key={f.name}
            className="flex w-44 flex-col items-center rounded-2xl border border-[#1C2C4D] bg-[#10213F] p-5 text-center transition-all duration-600 ease-out"
            style={{
              opacity: i < shown ? 1 : 0,
              transform: i < shown ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.96)',
            }}
          >
            {f.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={f.photo}
                alt={f.name}
                className="h-20 w-20 rounded-full object-cover ring-2 ring-[#4CC4F0]"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#0A1530] text-2xl font-black text-[#4CC4F0] ring-2 ring-[#4CC4F0]">
                {f.name.charAt(0)}
              </div>
            )}
            <p className="mt-3 text-lg font-bold text-[#F7F5EF]">{f.name}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#F5B546]">{f.role}</p>
            {f.tagline && <p className="mt-2 text-xs leading-snug text-[#9FB2D0]">{f.tagline}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
