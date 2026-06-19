'use client';

import { useEffect, useState } from 'react';

type BoldStatementRevealProps = {
  /** Main headline. Rendered big and bold, uppercase. */
  text?: string;
  /** Optional smaller line beneath the headline. */
  subtext?: string;
  className?: string;
};

/**
 * Slide cue: "Big Bold Letters appear ... NOBODY WANTS TO SIT THROUGH 40 SLIDES"
 * A blunt, high-impact headline that punches in on mount. Reusable for any
 * single-statement moment.
 */
export default function BoldStatementReveal({
  text = 'Nobody wants to sit through 40 slides',
  subtext,
  className = '',
}: BoldStatementRevealProps) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center bg-[#0A1530] px-8 text-center ${className}`}
    >
      <h1
        className="max-w-4xl text-4xl font-black uppercase leading-[1.05] tracking-tight text-[#F7F5EF] transition-all duration-700 ease-out sm:text-6xl md:text-7xl"
        style={{
          opacity: shown ? 1 : 0,
          transform: shown ? 'scale(1)' : 'scale(0.86)',
          filter: shown ? 'blur(0px)' : 'blur(8px)',
        }}
      >
        {text}
      </h1>
      {subtext && (
        <p
          className="mt-6 max-w-xl text-base text-[#9FB2D0] transition-all delay-300 duration-700 ease-out sm:text-lg"
          style={{
            opacity: shown ? 1 : 0,
            transform: shown ? 'translateY(0)' : 'translateY(12px)',
          }}
        >
          {subtext}
        </p>
      )}
    </div>
  );
}
