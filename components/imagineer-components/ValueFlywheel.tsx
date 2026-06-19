'use client';

import { useEffect, useState } from 'react';

type ValueFlywheelProps = {
  /** Ordered cycle steps. Defaults follow the script's chain. */
  steps?: string[];
  className?: string;
};

/**
 * Slide cue: "An animated flow chart ... student focus leads to better understanding,
 * which leads to higher scores, which leads to lifted rankings, which leads to
 * enrollment, which leads to revenue."
 * Rendered as a cycle (it compounds) that lights up step by step, then loops.
 */
export default function ValueFlywheel({
  steps = ['Focus', 'Understanding', 'Higher scores', 'Rankings', 'Enrollment', 'Revenue'],
  className = '',
}: ValueFlywheelProps) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % steps.length), 1100);
    return () => clearInterval(id);
  }, [steps.length]);

  const radius = 120;
  const cx = 160;
  const cy = 160;

  return (
    <div className={`flex h-full w-full items-center justify-center bg-[#0A1530] p-6 ${className}`}>
      <div className="relative" style={{ width: 320, height: 320 }}>
        <svg viewBox="0 0 320 320" className="absolute inset-0" aria-hidden="true">
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1C2C4D" strokeWidth="2" strokeDasharray="4 6" />
        </svg>

        {steps.map((step, i) => {
          const angle = (i / steps.length) * 2 * Math.PI - Math.PI / 2;
          const x = cx + radius * Math.cos(angle);
          const y = cy + radius * Math.sin(angle);
          const isActive = i === active;
          return (
            <div
              key={step}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border px-3 py-2 text-center text-xs font-semibold transition-all duration-500"
              style={{
                left: x,
                top: y,
                width: 92,
                borderColor: isActive ? '#4CC4F0' : '#1C2C4D',
                backgroundColor: isActive ? '#10213F' : '#0E1A33',
                color: isActive ? '#FFFFFF' : '#9FB2D0',
                boxShadow: isActive ? '0 0 18px rgba(76,196,240,0.35)' : 'none',
                transform: `translate(-50%, -50%) scale(${isActive ? 1.08 : 1})`,
              }}
            >
              {step}
            </div>
          );
        })}

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="text-2xl font-black text-[#F5B546]">↻</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[#6F86AD]">
            Compounds
          </p>
        </div>
      </div>
    </div>
  );
}
