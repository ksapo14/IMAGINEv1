'use client';

import { useEffect, useState } from 'react';

type Plan = {
  name: string;
  price: string;
  unit: string;
  blurb: string;
  highlight?: boolean;
};

type PricingRevealProps = {
  plans?: Plan[];
  className?: string;
};

/**
 * Slide cue: "pricing, $100 school / $39 teacher" — two cards slide in.
 */
export default function PricingReveal({
  plans = [
    {
      name: 'Schools',
      price: '$100',
      unit: '/ teacher license / month',
      blurb: 'Buy the licenses you need. Built for whole departments.',
      highlight: true,
    },
    {
      name: 'Individual teachers',
      price: '$39',
      unit: '/ month',
      blurb: 'Flexible, individual plan. Start in one classroom.',
    },
  ],
  className = '',
}: PricingRevealProps) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className={`flex h-full w-full items-center justify-center bg-[#0A1530] p-6 ${className}`}>
      <div className="grid w-full max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
        {plans.map((p, i) => (
          <div
            key={p.name}
            className="rounded-2xl border p-6 transition-all duration-700 ease-out"
            style={{
              borderColor: p.highlight ? '#4CC4F0' : '#1C2C4D',
              backgroundColor: p.highlight ? '#10213F' : '#0E1A33',
              opacity: shown ? 1 : 0,
              transform: shown ? 'translateY(0)' : 'translateY(24px)',
              transitionDelay: `${i * 150}ms`,
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-[#9FB2D0]">{p.name}</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-5xl font-black text-[#F7F5EF]">{p.price}</span>
              <span className="text-sm text-[#9FB2D0]">{p.unit}</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-[#CFE3F5]">{p.blurb}</p>
            {p.highlight && (
              <span className="mt-4 inline-block rounded-full bg-[#F5B546] px-3 py-1 text-xs font-bold text-[#0A1530]">
                Where we start
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
