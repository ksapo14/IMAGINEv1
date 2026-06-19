'use client';

import { useEffect, useState } from 'react';

type TamCounterProps = {
  /** Numeric target to count up to. */
  target?: number;
  prefix?: string;
  suffix?: string;
  label?: string;
  /** Decimal places to display. */
  decimals?: number;
  /** Optional aside line under the label. */
  aside?: string;
  className?: string;
};

/**
 * Slide cue: "Big number pops up with 2.4 BILLION DOLLARS" (also reusable for the
 * "2.15M teachers" reach figure). A clean count-up to a single headline number.
 */
export default function TamCounter({
  target = 2.4,
  prefix = '$',
  suffix = 'B',
  label = 'Total addressable market / year',
  decimals = 1,
  aside,
  className = '',
}: TamCounterProps) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const duration = 1600;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const delay = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(delay);
    };
  }, [target]);

  return (
    <div className={`flex h-full w-full flex-col items-center justify-center bg-[#0A1530] p-8 text-center ${className}`}>
      <span className="text-6xl font-black tracking-tight text-[#F5B546] sm:text-7xl md:text-8xl">
        {prefix}
        {value.toFixed(decimals)}
        {suffix}
      </span>
      <p className="mt-4 max-w-md text-sm font-semibold uppercase tracking-wider text-[#9FB2D0]">
        {label}
      </p>
      {aside && <p className="mt-2 text-sm text-[#6F86AD]">{aside}</p>}
    </div>
  );
}
