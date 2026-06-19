'use client';

import { useEffect, useState } from 'react';

type LogoTaglineLockupProps = {
  brand?: string;
  tagline?: string;
  className?: string;
};

/**
 * Slide cue: "(Imagine pops: logo + tagline lockup) ... open your eyes, and imagineer it."
 * The closing beat — logo settles, tagline fades up beneath it.
 */
export default function LogoTaglineLockup({
  brand = 'Imagineer',
  tagline = 'Open your eyes, and imagineer it.',
  className = '',
}: LogoTaglineLockupProps) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`flex h-full w-full flex-col items-center justify-center bg-[#0A1530] p-8 text-center ${className}`}>
      <div
        className="flex items-center gap-3 transition-all duration-700 ease-out"
        style={{ opacity: shown ? 1 : 0, transform: shown ? 'scale(1)' : 'scale(0.94)' }}
      >
        <svg width="52" height="52" viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r="20" fill="none" stroke="#4CC4F0" strokeWidth="2.5" />
          <path
            d="M14 27 C 18 14, 26 14, 30 27"
            fill="none"
            stroke="#F5B546"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="22" cy="16" r="2.5" fill="#F7F5EF" />
        </svg>
        <span className="text-5xl font-extrabold tracking-tight text-[#F7F5EF] sm:text-6xl">{brand}</span>
      </div>

      <p
        className="mt-6 max-w-lg text-lg text-[#9FB2D0] transition-all delay-300 duration-700 ease-out sm:text-xl"
        style={{ opacity: shown ? 1 : 0, transform: shown ? 'translateY(0)' : 'translateY(12px)' }}
      >
        {tagline}
      </p>
    </div>
  );
}
