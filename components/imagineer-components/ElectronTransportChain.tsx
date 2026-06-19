'use client';

/**
 * Slide cue: "CSS Animation of moving electron transport chain shows up."
 * A clean, looping diagram: electrons tumble down a chain of protein complexes
 * embedded in a membrane while protons pump across it. This is the visual that
 * "couldn't be pictured" in sophomore year — now it moves.
 */
type ElectronTransportChainProps = {
  className?: string;
};

export default function ElectronTransportChain({ className = '' }: ElectronTransportChainProps) {
  const complexes = [
    { x: 70, label: 'I' },
    { x: 190, label: 'III' },
    { x: 310, label: 'IV' },
    { x: 430, label: 'ATP' },
  ];

  return (
    <div className={`flex h-full w-full items-center justify-center bg-[#0A1530] p-6 ${className}`}>
      <style>{`
        @keyframes etc-electron {
          0%   { offset-distance: 0%;   opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
        @keyframes etc-proton {
          0%   { transform: translateY(0); opacity: 0; }
          15%  { opacity: 1; }
          100% { transform: translateY(-46px); opacity: 0; }
        }
        .etc-e {
          offset-path: path('M 70 130 L 190 130 L 310 130 L 430 130');
          animation: etc-electron 4.2s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .etc-e, .etc-p { animation: none !important; opacity: 0.9; }
        }
      `}</style>
      <svg viewBox="0 0 520 230" className="w-full max-w-2xl" role="img" aria-label="Electron transport chain">
        {/* Membrane */}
        <rect x="20" y="96" width="480" height="68" rx="6" fill="#16294D" />
        <line x1="20" y1="100" x2="500" y2="100" stroke="#24395f" strokeWidth="2" />
        <line x1="20" y1="160" x2="500" y2="160" stroke="#24395f" strokeWidth="2" />

        {/* Complexes */}
        {complexes.map((c, i) => (
          <g key={c.label}>
            <rect
              x={c.x - 26}
              y={86}
              width="52"
              height="88"
              rx="10"
              fill={i === complexes.length - 1 ? '#F5B546' : '#1E3A66'}
              stroke="#4CC4F0"
              strokeWidth="1.5"
            />
            <text
              x={c.x}
              y={136}
              textAnchor="middle"
              fontSize="14"
              fontWeight="700"
              fill={i === complexes.length - 1 ? '#0A1530' : '#CFE3F5'}
            >
              {c.label}
            </text>
          </g>
        ))}

        {/* Electrons tumbling down the chain */}
        {[0, 1.4, 2.8].map((d, i) => (
          <circle key={i} r="6" fill="#4CC4F0" className="etc-e" style={{ animationDelay: `${d}s` }} />
        ))}

        {/* Protons pumping across the membrane */}
        {complexes.slice(0, 3).map((c, i) => (
          <circle
            key={`p-${i}`}
            cx={c.x}
            cy="150"
            r="4.5"
            fill="#F5B546"
            className="etc-p"
            style={{
              animation: `etc-proton 2.6s ease-in infinite`,
              animationDelay: `${i * 0.6}s`,
            }}
          />
        ))}

        {/* Labels */}
        <text x="30" y="40" fontSize="12" fill="#9FB2D0" fontWeight="600">
          H⁺ gradient
        </text>
        <text x="30" y="212" fontSize="12" fill="#9FB2D0" fontWeight="600">
          electrons →
        </text>
      </svg>
    </div>
  );
}
