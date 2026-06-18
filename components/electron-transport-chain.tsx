import { memo } from "react";

const electronTransportChainSvg = String.raw`
<svg width="100%" viewBox="0 0 680 360" role="img">
  <title>Electron Transport Chain</title>
  <desc>Animated diagram of the mitochondrial electron transport chain, showing electrons flowing through Complexes I-IV, protons pumped across the inner membrane, ATP synthase spinning, and water formed at Complex IV.</desc>

  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
  </defs>

  <text font-family="var(--font-sans,sans-serif)" font-size="12" font-weight="400" fill="var(--color-text-secondary,#888)" x="18" y="98" opacity="0.8">Intermembrane</text>
  <text font-family="var(--font-sans,sans-serif)" font-size="12" font-weight="400" fill="var(--color-text-secondary,#888)" x="30" y="113" opacity="0.8">space (H+ rich)</text>
  <text font-family="var(--font-sans,sans-serif)" font-size="12" font-weight="400" fill="var(--color-text-secondary,#888)" x="30" y="330" opacity="0.8"></text>

  <rect x="14" y="130" width="652" height="18" rx="4" fill="#C0DD97" opacity="0.55"/>
  <rect x="14" y="248" width="652" height="18" rx="4" fill="#C0DD97" opacity="0.55"/>
  <text font-family="var(--font-sans,sans-serif)" font-size="10" font-weight="500" fill="#3B6D11" x="580" y="143" text-anchor="middle">Inner</text>
  <text font-family="var(--font-sans,sans-serif)" font-size="10" font-weight="500" fill="#3B6D11" x="580" y="155" text-anchor="middle">membrane</text>
  <text font-family="var(--font-sans,sans-serif)" font-size="10" font-weight="500" fill="#3B6D11" x="580" y="166" text-anchor="middle">(lipid bilayer)</text>

  <line x1="160" y1="200" x2="268" y2="200" stroke="#AFA9EC" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#arr)" fill="none"/>
  <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#3C3489" x="213" y="193" text-anchor="middle">CoQ</text>
  <line x1="388" y1="200" x2="468" y2="200" stroke="#AFA9EC" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#arr)" fill="none"/>
  <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#3C3489" x="428" y="193" text-anchor="middle">Cyt c</text>

  <g>
    <rect x="40" y="148" width="110" height="110" rx="10" fill="#EEEDFE" stroke="#7F77DD" stroke-width="1"/>
    <text font-family="var(--font-sans,sans-serif)" font-size="13" font-weight="500" fill="#3C3489" x="95" y="178" text-anchor="middle">Complex I</text>
    <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#534AB7" x="95" y="193" text-anchor="middle">NADH</text>
    <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#534AB7" x="95" y="205" text-anchor="middle">dehydrogenase</text>
    <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#534AB7" x="18" y="228" text-anchor="start" opacity="0.7">NADH-></text>
    <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#534AB7" x="18" y="243" text-anchor="start" opacity="0.7">NAD+</text>
    <circle cx="48" cy="235" r="4" fill="#7F77DD" opacity="0.5">
      <animate attributeName="cx" from="28" to="48" dur="1.4s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;0.8;0" dur="1.4s" repeatCount="indefinite"/>
    </circle>
  </g>

  <circle cx="158" cy="200" r="5" fill="#534AB7">
    <animate attributeName="cx" values="150;266" dur="1s" begin="0s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" dur="1s" repeatCount="indefinite"/>
  </circle>
  <circle cx="200" cy="200" r="5" fill="#534AB7">
    <animate attributeName="cx" values="150;266" dur="1s" begin="0.5s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" dur="1s" repeatCount="indefinite"/>
  </circle>

  <circle cx="80" cy="148" r="4" fill="#D85A30">
    <animate attributeName="cy" values="240;128" dur="1.2s" begin="0s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" dur="1.2s" repeatCount="indefinite"/>
  </circle>
  <circle cx="95" cy="148" r="4" fill="#D85A30">
    <animate attributeName="cy" values="240;128" dur="1.2s" begin="0.4s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" dur="1.2s" repeatCount="indefinite"/>
  </circle>
  <circle cx="110" cy="148" r="4" fill="#D85A30">
    <animate attributeName="cy" values="240;128" dur="1.2s" begin="0.8s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" dur="1.2s" repeatCount="indefinite"/>
  </circle>
  <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#993C1D" x="95" y="125" text-anchor="middle" opacity="0.8">4H+</text>

  <g>
    <rect x="175" y="172" width="90" height="86" rx="10" fill="#EEEDFE" stroke="#7F77DD" stroke-width="1"/>
    <text font-family="var(--font-sans,sans-serif)" font-size="12" font-weight="500" fill="#3C3489" x="220" y="200" text-anchor="middle">Complex II</text>
    <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#534AB7" x="220" y="215" text-anchor="middle">Succinate</text>
    <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#534AB7" x="220" y="227" text-anchor="middle">dehydrogenase</text>
    <text font-family="var(--font-sans,sans-serif)" font-size="9" fill="#534AB7" x="220" y="242" text-anchor="middle" opacity="0.7">FADH2 -> FAD</text>
  </g>
  <circle cx="270" cy="200" r="5" fill="#7F77DD">
    <animate attributeName="cx" values="265;270" dur="0.8s" begin="0.2s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;0.7;0" dur="0.8s" repeatCount="indefinite"/>
  </circle>

  <g>
    <rect x="278" y="148" width="110" height="110" rx="10" fill="#E1F5EE" stroke="#1D9E75" stroke-width="1"/>
    <text font-family="var(--font-sans,sans-serif)" font-size="13" font-weight="500" fill="#085041" x="333" y="178" text-anchor="middle">Complex III</text>
    <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#0F6E56" x="333" y="193" text-anchor="middle">Cytochrome</text>
    <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#0F6E56" x="333" y="205" text-anchor="middle">bc1 complex</text>
  </g>
  <circle cx="390" cy="200" r="5" fill="#534AB7">
    <animate attributeName="cx" values="388;466" dur="0.9s" begin="0s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" dur="0.9s" repeatCount="indefinite"/>
  </circle>
  <circle cx="430" cy="200" r="5" fill="#534AB7">
    <animate attributeName="cx" values="388;466" dur="0.9s" begin="0.45s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" dur="0.9s" repeatCount="indefinite"/>
  </circle>
  <circle cx="313" cy="148" r="4" fill="#D85A30">
    <animate attributeName="cy" values="240;128" dur="1.2s" begin="0.2s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" dur="1.2s" repeatCount="indefinite"/>
  </circle>
  <circle cx="333" cy="148" r="4" fill="#D85A30">
    <animate attributeName="cy" values="240;128" dur="1.2s" begin="0.6s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" dur="1.2s" repeatCount="indefinite"/>
  </circle>
  <circle cx="353" cy="148" r="4" fill="#D85A30">
    <animate attributeName="cy" values="240;128" dur="1.2s" begin="1.0s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" dur="1.2s" repeatCount="indefinite"/>
  </circle>
  <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#993C1D" x="333" y="125" text-anchor="middle" opacity="0.8">4H+</text>

  <g>
    <rect x="408" y="148" width="110" height="110" rx="10" fill="#FAF3E0" stroke="#BA7517" stroke-width="1"/>
    <text font-family="var(--font-sans,sans-serif)" font-size="13" font-weight="500" fill="#633806" x="463" y="178" text-anchor="middle">Complex IV</text>
    <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#854F0B" x="463" y="193" text-anchor="middle">Cytochrome</text>
    <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#854F0B" x="463" y="205" text-anchor="middle">c oxidase</text>
    <text font-family="var(--font-sans,sans-serif)" font-size="9" fill="#854F0B" x="463" y="232" text-anchor="middle">O2 + 4H+ -></text>
    <text font-family="var(--font-sans,sans-serif)" font-size="9" fill="#185FA5" x="463" y="246" text-anchor="middle">
      <animate attributeName="opacity" values="0;0;1;1;0" dur="2s" repeatCount="indefinite"/>
      2H2O
    </text>
  </g>

  <line x1="550" y1="220" x2="520" y2="220" stroke="#185FA5" stroke-width="1.5" stroke-dasharray="3 3" marker-end="url(#arr)" fill="none"/>
  <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#185FA5" x="557" y="224" text-anchor="start">O2</text>
  <circle cx="443" cy="148" r="4" fill="#D85A30">
    <animate attributeName="cy" values="240;128" dur="1.2s" begin="0.1s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" dur="1.2s" repeatCount="indefinite"/>
  </circle>
  <circle cx="463" cy="148" r="4" fill="#D85A30">
    <animate attributeName="cy" values="240;128" dur="1.2s" begin="0.5s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" dur="1.2s" repeatCount="indefinite"/>
  </circle>
  <circle cx="483" cy="148" r="4" fill="#D85A30">
    <animate attributeName="cy" values="240;128" dur="1.2s" begin="0.9s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" dur="1.2s" repeatCount="indefinite"/>
  </circle>
  <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#993C1D" x="463" y="125" text-anchor="middle" opacity="0.8">2H+</text>

  <path d="M480 82 Q340 50 150 82" stroke="#993C1D" stroke-width="1.2" stroke-dasharray="5 4" fill="none" marker-end="url(#arr)"/>
  <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#993C1D" x="330" y="48" text-anchor="middle">H+ gradient builds up in intermembrane space</text>

  <rect x="543" y="145" width="12" height="125" rx="4" fill="#9FE1CB" stroke="#1D9E75" stroke-width="0.8"/>
  <ellipse cx="549" cy="278" rx="32" ry="18" fill="#E1F5EE" stroke="#1D9E75" stroke-width="1"/>
  <ellipse cx="549" cy="190" rx="26" ry="14" fill="#5DCAA5" stroke="#0F6E56" stroke-width="1" opacity="0.85">
    <animateTransform attributeName="transform" type="rotate" from="0 549 190" to="360 549 190" dur="1.5s" repeatCount="indefinite"/>
  </ellipse>
  <text font-family="var(--font-sans,sans-serif)" font-size="12" font-weight="500" fill="#085041" x="549" y="298" text-anchor="middle">ATP synthase</text>
  <circle cx="549" cy="145" r="4" fill="#D85A30">
    <animate attributeName="cy" values="126;270" dur="1s" begin="0s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" dur="1s" repeatCount="indefinite"/>
  </circle>
  <circle cx="549" cy="145" r="4" fill="#D85A30">
    <animate attributeName="cy" values="126;270" dur="1s" begin="0.33s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" dur="1s" repeatCount="indefinite"/>
  </circle>
  <circle cx="549" cy="145" r="4" fill="#D85A30">
    <animate attributeName="cy" values="126;270" dur="1s" begin="0.66s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" dur="1s" repeatCount="indefinite"/>
  </circle>

  <text font-family="var(--font-sans,sans-serif)" font-size="12" font-weight="500" fill="#085041" x="612" y="320" text-anchor="start">
    <animate attributeName="opacity" values="0;0;1;1;0" dur="1.8s" repeatCount="indefinite" begin="0.2s"/>
    ATP
  </text>
  <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#0F6E56" x="612" y="335" text-anchor="start">
    <animate attributeName="opacity" values="0;0;1;1;0" dur="1.8s" repeatCount="indefinite" begin="0.6s"/>
    ADP+Pi ->
  </text>
  <text font-family="var(--font-sans,sans-serif)" font-size="10" fill="#0F6E56" x="612" y="348" text-anchor="start">
    <animate attributeName="opacity" values="0;0;1;1;0" dur="1.8s" repeatCount="indefinite" begin="1s"/>
    ATP
  </text>
</svg>`;

export const ElectronTransportChain = memo(function ElectronTransportChain() {
  return (
    <div className="w-full max-w-6xl bg-white">
      <style>{`
        @keyframes electronFlow {
          0% { transform: translateX(0); opacity: 1; }
          100% { transform: translateX(var(--dx, 80px)); opacity: 0; }
        }
        @keyframes protonPump {
          0% { transform: translateY(0); opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(-52px); opacity: 0; }
        }
        @keyframes protonReturn {
          0% { transform: translateY(0); opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(48px); opacity: 0; }
        }
        @keyframes atpSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes atpAppear {
          0% { transform: scale(0.5) translateY(10px); opacity: 0; }
          30% { transform: scale(1.1) translateY(-2px); opacity: 1; }
          70% { transform: scale(1) translateY(0); opacity: 1; }
          100% { transform: scale(0.8) translateY(-8px); opacity: 0; }
        }
        @keyframes nadh {
          0% { transform: translateX(0); opacity: 1; }
          100% { transform: translateX(20px); opacity: 0; }
        }
        @keyframes waterAppear {
          0% { opacity: 0; transform: translateY(6px); }
          30% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-6px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        .e-dot {
          fill: #534AB7;
          r: 5px;
          animation: electronFlow 1.4s ease-in infinite;
        }
        .p-dot-up {
          fill: #D85A30;
          r: 4px;
          animation: protonPump 1.2s ease-in infinite;
        }
        .p-dot-down {
          fill: #D85A30;
          r: 4px;
          animation: protonReturn 1.2s ease-in infinite;
        }
        .atp-label {
          font-family: var(--font-sans, sans-serif);
          font-size: 11px;
          font-weight: 500;
          fill: #085041;
          animation: atpAppear 1.8s ease-in-out infinite;
        }
        .water-label {
          font-family: var(--font-sans, sans-serif);
          font-size: 10px;
          fill: #185FA5;
          animation: waterAppear 2s ease-in-out infinite;
        }
        .pulse-glow {
          animation: pulse 2s ease-in-out infinite;
        }
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: electronTransportChainSvg }} />
    </div>
  );
});
