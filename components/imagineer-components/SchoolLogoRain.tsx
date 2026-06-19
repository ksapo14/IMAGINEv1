'use client';

type SchoolLogoRainProps = {
  /** School names to rain down. */
  names?: string[];
  className?: string;
};

/**
 * Slide cue: "A collage of names of tuition paying schools falls from the screen.
 * Think duke and durham academy and a bunch more logos just falling from the sky."
 * Restrained falling chips — staggered, settling, not chaotic.
 */
export default function SchoolLogoRain({
  names = [
    'Duke',
    'Durham Academy',
    'Cary Academy',
    'Ravenscroft',
    'Trinity',
    'St. David’s',
    'Carolina Friends',
    'Wake Forest',
  ],
  className = '',
}: SchoolLogoRainProps) {
  return (
    <div className={`relative h-full w-full overflow-hidden bg-[#0A1530] ${className}`}>
      <style>{`
        @keyframes slr-fall {
          0%   { transform: translateY(-120%) rotate(-4deg); opacity: 0; }
          15%  { opacity: 1; }
          100% { transform: translateY(0) rotate(0deg); opacity: 1; }
        }
        .slr-chip { animation: slr-fall 1.1s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        @media (prefers-reduced-motion: reduce) { .slr-chip { animation: none; opacity: 1; transform: none; } }
      `}</style>

      <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
        <div className="flex max-w-2xl flex-wrap justify-center gap-3">
          {names.map((name, i) => (
            <span
              key={name}
              className="slr-chip rounded-xl border border-[#26416E] bg-[#10213F] px-4 py-2 text-sm font-semibold text-[#E6EEF9] shadow"
              style={{ animationDelay: `${i * 160}ms` }}
            >
              {name}
            </span>
          ))}
        </div>
        <p className="mt-2 text-sm text-[#9FB2D0]">Tuition-paying schools — most willing to experiment.</p>
      </div>
    </div>
  );
}
