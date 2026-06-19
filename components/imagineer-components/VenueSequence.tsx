'use client';

import { useEffect, useState } from 'react';

type Venue = { label: string; icon: 'classroom' | 'lecture' | 'boardroom' | 'keynote' };

type VenueSequenceProps = {
  venues?: Venue[];
  className?: string;
};

function VenueIcon({ type }: { type: Venue['icon'] }) {
  const stroke = '#4CC4F0';
  switch (type) {
    case 'classroom':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect x="6" y="8" width="28" height="18" rx="2" stroke={stroke} strokeWidth="2" />
          <line x1="10" y1="14" x2="24" y2="14" stroke="#F5B546" strokeWidth="2" />
          <circle cx="20" cy="32" r="3" stroke={stroke} strokeWidth="2" />
        </svg>
      );
    case 'lecture':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path d="M6 30 L20 8 L34 30" stroke={stroke} strokeWidth="2" />
          <line x1="11" y1="22" x2="29" y2="22" stroke="#F5B546" strokeWidth="2" />
          <line x1="8" y1="30" x2="32" y2="30" stroke={stroke} strokeWidth="2" />
        </svg>
      );
    case 'boardroom':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect x="8" y="16" width="24" height="10" rx="5" stroke={stroke} strokeWidth="2" />
          <circle cx="12" cy="10" r="2" fill="#F5B546" />
          <circle cx="20" cy="9" r="2" fill="#F5B546" />
          <circle cx="28" cy="10" r="2" fill="#F5B546" />
        </svg>
      );
    case 'keynote':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect x="8" y="8" width="24" height="16" rx="2" stroke={stroke} strokeWidth="2" />
          <path d="M16 28 L24 28 L26 34 L14 34 Z" stroke={stroke} strokeWidth="2" />
          <circle cx="20" cy="16" r="3" fill="#F5B546" />
        </svg>
      );
  }
}

/**
 * Slide cue: classroom → lecture hall → boardroom → keynote stage.
 * "Anywhere a person stands up to explain something hard." Scope expands step by step.
 */
export default function VenueSequence({
  venues = [
    { label: 'Classroom', icon: 'classroom' },
    { label: 'Lecture hall', icon: 'lecture' },
    { label: 'Boardroom', icon: 'boardroom' },
    { label: 'Keynote stage', icon: 'keynote' },
  ],
  className = '',
}: VenueSequenceProps) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
    const timers = venues.map((_, i) => setTimeout(() => setShown((s) => Math.max(s, i + 1)), 500 + i * 750));
    return () => timers.forEach(clearTimeout);
  }, [venues]);

  return (
    <div className={`flex h-full w-full items-center justify-center bg-[#0A1530] p-6 ${className}`}>
      <div className="flex max-w-3xl flex-wrap items-center justify-center gap-3">
        {venues.map((v, i) => (
          <div key={v.label} className="flex items-center gap-3">
            {i > 0 && (
              <span
                className="text-xl text-[#9FB2D0] transition-opacity duration-400"
                style={{ opacity: i < shown ? 1 : 0 }}
              >
                →
              </span>
            )}
            <div
              className="flex w-28 flex-col items-center gap-2 rounded-xl border border-[#26416E] bg-[#10213F] px-3 py-4 transition-all duration-500 ease-out"
              style={{
                opacity: i < shown ? 1 : 0,
                transform: i < shown ? 'translateY(0)' : 'translateY(12px)',
              }}
            >
              <VenueIcon type={v.icon} />
              <span className="text-sm font-semibold text-[#E6EEF9]">{v.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
