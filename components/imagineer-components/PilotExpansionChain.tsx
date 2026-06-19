'use client';

import { useEffect, useState } from 'react';

type PilotExpansionChainProps = {
  /** The accumulating terms, in order. The last is treated as the result. */
  terms?: string[];
  result?: string;
  className?: string;
};

/**
 * Slide cue: "Pilots → Pilots + results → Pilots + results + case studies →
 * Pilots + results + case studies = Expansion."
 * Terms accumulate left to right, then the result lands.
 */
export default function PilotExpansionChain({
  terms = ['Pilots', 'Results', 'Case studies'],
  result = 'Expansion',
  className = '',
}: PilotExpansionChainProps) {
  const [step, setStep] = useState(0);
  const total = terms.length + 1; // +1 for result

  useEffect(() => {
    setStep(0);
    const timers = Array.from({ length: total }).map((_, i) =>
      setTimeout(() => setStep((s) => Math.max(s, i + 1)), 600 + i * 850),
    );
    return () => timers.forEach(clearTimeout);
  }, [total]);

  return (
    <div className={`flex h-full w-full items-center justify-center bg-[#0A1530] p-6 ${className}`}>
      <div className="flex max-w-3xl flex-wrap items-center justify-center gap-3">
        {terms.map((term, i) => (
          <div key={term} className="flex items-center gap-3">
            {i > 0 && (
              <span
                className="text-2xl font-bold text-[#9FB2D0] transition-opacity duration-400"
                style={{ opacity: i < step ? 1 : 0 }}
              >
                +
              </span>
            )}
            <span
              className="rounded-xl border border-[#26416E] bg-[#10213F] px-5 py-3 text-base font-semibold text-[#E6EEF9] transition-all duration-500 ease-out"
              style={{
                opacity: i < step ? 1 : 0,
                transform: i < step ? 'translateY(0)' : 'translateY(10px)',
              }}
            >
              {term}
            </span>
          </div>
        ))}

        <span
          className="text-2xl font-bold text-[#F5B546] transition-opacity duration-400"
          style={{ opacity: step >= total ? 1 : 0 }}
        >
          =
        </span>
        <span
          className="rounded-xl bg-[#F5B546] px-5 py-3 text-base font-black text-[#0A1530] transition-all duration-500 ease-out"
          style={{
            opacity: step >= total ? 1 : 0,
            transform: step >= total ? 'scale(1)' : 'scale(0.85)',
          }}
        >
          {result}
        </span>
      </div>
    </div>
  );
}
