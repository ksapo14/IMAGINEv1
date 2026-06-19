'use client';

import { useEffect, useState } from 'react';

type AdoptionStep = { label: string; sub?: string };

type VerticalAdoptionFlowProps = {
  steps?: AdoptionStep[];
  className?: string;
};

/**
 * Slide cue: "Begin a vertical flowchart starting with teacher → Department Chair →
 * Principal (fill in at each word, make font a little bigger each step)."
 * Teachers become the sales team; the chart fills top-down.
 */
export default function VerticalAdoptionFlow({
  steps = [
    { label: 'Teacher', sub: 'saves 6 hours a week' },
    { label: 'Department Chair', sub: 'sees it next door' },
    { label: 'Principal', sub: 'sees classrooms running on it' },
  ],
  className = '',
}: VerticalAdoptionFlowProps) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
    const timers = steps.map((_, i) => setTimeout(() => setShown((s) => Math.max(s, i + 1)), 600 + i * 900));
    return () => timers.forEach(clearTimeout);
  }, [steps]);

  return (
    <div className={`flex h-full w-full items-center justify-center bg-[#0A1530] p-6 ${className}`}>
      <div className="flex flex-col items-center gap-2">
        {steps.map((step, i) => {
          const visible = i < shown;
          const scale = 1 + i * 0.12; // each one a little bigger
          return (
            <div key={step.label} className="flex flex-col items-center">
              <div
                className="rounded-xl border border-[#26416E] bg-[#10213F] px-6 py-3 text-center transition-all duration-500 ease-out"
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? `scale(${scale})` : `scale(${scale * 0.9})`,
                }}
              >
                <p className="font-bold text-[#F7F5EF]">{step.label}</p>
                {step.sub && <p className="mt-0.5 text-xs text-[#9FB2D0]">{step.sub}</p>}
              </div>
              {i < steps.length - 1 && (
                <span
                  className="my-1 text-2xl text-[#4CC4F0] transition-opacity duration-500"
                  style={{ opacity: i + 1 < shown ? 1 : 0 }}
                >
                  ↓
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
