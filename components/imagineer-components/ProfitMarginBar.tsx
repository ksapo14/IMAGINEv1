'use client';

import { useEffect, useState } from 'react';

type ProfitMarginBarProps = {
  /** Token cost per teacher per month. */
  cost?: number;
  /** Price charged per teacher per month (school plan). */
  price?: number;
  className?: string;
};

/**
 * Slide cue: "A graph that shows the cost per user at 7 dollars per month and how the
 * 92 percent profit margin is derived."
 * A single bar splits into a thin cost sliver and a large margin band; the margin
 * percentage counts up.
 */
export default function ProfitMarginBar({ cost = 7, price = 100, className = '' }: ProfitMarginBarProps) {
  const margin = Math.round(((price - cost) / price) * 100);
  const costPct = (cost / price) * 100;

  const [fill, setFill] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const start = requestAnimationFrame(() => setFill(1));
    const duration = 1300;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setCount(Math.round(margin * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const delay = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 250);
    return () => {
      cancelAnimationFrame(start);
      cancelAnimationFrame(raf);
      clearTimeout(delay);
    };
  }, [margin]);

  return (
    <div className={`flex h-full w-full items-center justify-center bg-[#0A1530] p-8 ${className}`}>
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <span className="text-6xl font-black text-[#4CC4F0]">{count}%</span>
          <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-[#9FB2D0]">
            gross margin per teacher
          </p>
        </div>

        <div className="flex h-12 w-full overflow-hidden rounded-xl border border-[#1C2C4D]">
          {/* Cost sliver */}
          <div
            className="flex items-center justify-center bg-[#F5B546] transition-all duration-1000 ease-out"
            style={{ width: fill ? `${costPct}%` : '0%' }}
          >
            <span className="px-1 text-[10px] font-bold text-[#0A1530]">${cost}</span>
          </div>
          {/* Margin band */}
          <div
            className="flex items-center justify-end bg-[#10213F] transition-all duration-1000 ease-out"
            style={{ width: fill ? `${100 - costPct}%` : '0%', transitionDelay: '200ms' }}
          >
            <span className="px-3 text-xs font-semibold text-[#CFE3F5]">margin</span>
          </div>
        </div>

        <div className="mt-3 flex justify-between text-xs text-[#9FB2D0]">
          <span>Token cost ≈ ${cost}/mo</span>
          <span>Price ${price}/mo</span>
        </div>
      </div>
    </div>
  );
}
