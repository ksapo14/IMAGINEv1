'use client';

import { useEffect, useState } from 'react';

type LogoGlowUpProps = {
  /** Wordmark text shown after the "fix". */
  brand?: string;
  /** Auto-trigger the fix after this many ms. */
  delay?: number;
  className?: string;
};

/**
 * Slide cue: "A bad 8 bit low quality logo appears ... fix it ... Our normal logo appears"
 * Shows a pixelated placeholder that dissolves into the clean Imagineer wordmark.
 */
export default function LogoGlowUp({
  brand = 'Imagineer',
  delay = 1400,
  className = '',
}: LogoGlowUpProps) {
  const [fixed, setFixed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFixed(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      className={`relative flex h-full w-full items-center justify-center bg-[#0A1530] ${className}`}
    >
      {/* 8-bit / broken version */}
      <div
        className="absolute flex items-center gap-3 transition-all duration-500 ease-in"
        style={{
          opacity: fixed ? 0 : 1,
          transform: fixed ? 'scale(0.9)' : 'scale(1)',
          imageRendering: 'pixelated',
        }}
      >
        <div className="grid grid-cols-4 gap-[3px]">
          {[1, 0, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1].map((on, i) => (
            <span
              key={i}
              className="h-3 w-3 sm:h-4 sm:w-4"
              style={{ backgroundColor: on ? '#4CC4F0' : '#1C2C4D' }}
            />
          ))}
        </div>
        <span
          className="text-3xl font-bold tracking-widest text-[#6F86AD] sm:text-4xl"
          style={{ fontFamily: 'monospace', letterSpacing: '0.15em' }}
        >
          1MAG1N33R
        </span>
      </div>

      {/* Clean version */}
      <div
        className="flex items-center gap-3 transition-all duration-700 ease-out"
        style={{
          opacity: fixed ? 1 : 0,
          transform: fixed ? 'scale(1)' : 'scale(1.06)',
          filter: fixed ? 'blur(0px)' : 'blur(10px)',
        }}
      >
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
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
        <span className="text-4xl font-extrabold tracking-tight text-[#F7F5EF] sm:text-5xl">
          {brand}
        </span>
      </div>
    </div>
  );
}
