'use client';

import { useEffect, useState } from 'react';

type CompetitorComparisonTableProps = {
  className?: string;
};

const FEATURES = ['Generates visuals', 'Live as you teach', 'Listens to the room', 'Zero prep'];

const ROWS: { name: string; cells: boolean[]; us?: boolean }[] = [
  { name: 'Canva', cells: [true, false, false, false] },
  { name: 'Google Slides', cells: [true, false, false, false] },
  { name: 'ChatGPT', cells: [true, false, false, false] },
  { name: 'Imagineer', cells: [true, true, true, true], us: true },
];

/**
 * Slide cue: "show these tools in a table put up against Imagineer ... a table with
 * checkmarks and features." Cells fill in row by row; only Imagineer goes live.
 */
export default function CompetitorComparisonTable({ className = '' }: CompetitorComparisonTableProps) {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    const timers = ROWS.map((_, i) => setTimeout(() => setRevealed((r) => Math.max(r, i + 1)), 500 + i * 500));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className={`flex h-full w-full items-center justify-center bg-[#0A1530] p-6 ${className}`}>
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-[#1C2C4D]">
        {/* Header */}
        <div className="grid grid-cols-[1.4fr_repeat(4,1fr)] bg-[#0E1A33]">
          <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#6F86AD]">
            Tool
          </div>
          {FEATURES.map((f) => (
            <div key={f} className="px-2 py-3 text-center text-[11px] font-semibold leading-tight text-[#9FB2D0]">
              {f}
            </div>
          ))}
        </div>

        {/* Rows */}
        {ROWS.map((row, ri) => {
          const visible = ri < revealed;
          return (
            <div
              key={row.name}
              className="grid grid-cols-[1.4fr_repeat(4,1fr)] border-t border-[#1C2C4D] transition-all duration-500"
              style={{
                opacity: visible ? 1 : 0.15,
                backgroundColor: row.us ? '#10213F' : 'transparent',
              }}
            >
              <div
                className="px-4 py-3 text-sm font-bold"
                style={{ color: row.us ? '#4CC4F0' : '#E6EEF9' }}
              >
                {row.name}
              </div>
              {row.cells.map((on, ci) => (
                <div key={ci} className="flex items-center justify-center py-3">
                  <span
                    className="text-lg font-bold transition-all duration-300"
                    style={{
                      opacity: visible ? 1 : 0,
                      transform: visible ? 'scale(1)' : 'scale(0.5)',
                      color: on ? (row.us ? '#4CC4F0' : '#7FB58A') : '#3A4A6B',
                    }}
                  >
                    {on ? '✓' : '—'}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
