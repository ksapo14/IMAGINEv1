"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

export function KnowledgeScene() {
  const scene = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      if (reduceMotion) {
        return;
      }

      gsap.to(".knowledge-ring-a", {
        rotateX: "+=360",
        rotateZ: "+=130",
        duration: 24,
        ease: "none",
        repeat: -1
      });
      gsap.to(".knowledge-ring-b", {
        rotateY: "-=360",
        rotateZ: "-=90",
        duration: 31,
        ease: "none",
        repeat: -1
      });
      gsap.to(".knowledge-node", {
        z: 54,
        scale: 1.12,
        duration: 2.4,
        stagger: { each: 0.22, repeat: -1, yoyo: true },
        ease: "sine.inOut"
      });
      gsap.to(".learning-plane", {
        y: -14,
        rotateY: "+=5",
        duration: 3.2,
        stagger: { each: 0.35, repeat: -1, yoyo: true },
        ease: "sine.inOut"
      });
    },
    { scope: scene }
  );

  return (
    <div ref={scene} className="knowledge-scene pointer-events-none absolute right-[-4vw] top-[13%] z-[2] h-[min(74vw,820px)] w-[min(58vw,850px)] [perspective:1200px] max-[1000px]:right-[-18vw] max-[1000px]:w-[72vw] max-[1000px]:opacity-[0.78] max-[767px]:right-[-34vw] max-[767px]:top-[45%] max-[767px]:h-[105vw] max-[767px]:w-[120vw] max-[767px]:opacity-[0.58]" aria-hidden="true">
      <div className="knowledge-stage absolute inset-[8%] [transform-style:preserve-3d] [transform:rotateX(62deg)_rotateZ(-21deg)] max-[767px]:inset-[13%] max-[767px]:[transform:rotateX(68deg)_rotateZ(-24deg)_scale(0.72)]">
        <div className="absolute left-1/2 top-1/2 h-40 w-40 [transform-style:preserve-3d] [transform:translate3d(-50%,-50%,90px)]">
          <span className="absolute inset-0 rounded-full border [border-color:color-mix(in_srgb,var(--signal)_70%,transparent)] [background:radial-gradient(circle_at_38%_32%,color-mix(in_srgb,var(--paper)_52%,transparent),transparent_15%),radial-gradient(circle,var(--signal),color-mix(in_srgb,var(--signal)_16%,transparent)_62%,transparent_64%)] [box-shadow:inset_-22px_-26px_50px_color-mix(in_srgb,var(--page-deep)_58%,transparent),0_0_70px_color-mix(in_srgb,var(--signal)_24%,transparent)]" />
          <span className="absolute inset-0 animate-core-breathe rounded-full border border-[var(--signal)]" />
        </div>
        <div className="knowledge-ring-a absolute left-1/2 top-1/2 h-[510px] w-[510px] rounded-full border border-[var(--line-strong)] [transform-style:preserve-3d] [transform:translate3d(-50%,-50%,20px)_rotateX(68deg)_rotateZ(12deg)]">
          <span className="knowledge-node absolute left-[48%] top-[3%] h-6 w-6 rounded-full border-[5px] [border-color:color-mix(in_srgb,var(--panel)_72%,transparent)] bg-[var(--inquiry)] shadow-[0_0_0_1px_var(--line-strong)]" />
          <span className="knowledge-node absolute bottom-[24%] right-[4%] h-6 w-6 rounded-full border-[5px] [border-color:color-mix(in_srgb,var(--panel)_72%,transparent)] bg-[var(--signal)] shadow-[0_0_0_1px_var(--line-strong)]" />
          <span className="knowledge-node absolute bottom-[7%] left-[22%] h-6 w-6 rounded-full border-[5px] [border-color:color-mix(in_srgb,var(--panel)_72%,transparent)] bg-[var(--inquiry)] shadow-[0_0_0_1px_var(--line-strong)]" />
        </div>
        <div className="knowledge-ring-b absolute left-1/2 top-1/2 h-[690px] w-[690px] rounded-full border border-[var(--line-strong)] [transform-style:preserve-3d] [transform:translate3d(-50%,-50%,-35px)_rotateY(66deg)_rotateZ(-16deg)]">
          <span className="knowledge-node absolute left-[8%] top-[18%] h-6 w-6 rounded-full border-[5px] [border-color:color-mix(in_srgb,var(--panel)_72%,transparent)] bg-[var(--signal)] shadow-[0_0_0_1px_var(--line-strong)]" />
          <span className="knowledge-node absolute right-[-1%] top-[46%] h-6 w-6 rounded-full border-[5px] [border-color:color-mix(in_srgb,var(--panel)_72%,transparent)] bg-[var(--inquiry)] shadow-[0_0_0_1px_var(--line-strong)]" />
          <span className="knowledge-node absolute bottom-[3%] left-[56%] h-6 w-6 rounded-full border-[5px] [border-color:color-mix(in_srgb,var(--panel)_72%,transparent)] bg-[var(--signal)] shadow-[0_0_0_1px_var(--line-strong)]" />
        </div>
        <div className="learning-plane absolute left-[6%] top-[5%] z-4 min-h-[120px] w-[190px] rounded-lg border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--panel)_88%,transparent)] p-[18px] text-[var(--text)] shadow-[0_22px_55px_var(--shadow)] backdrop-blur-[13px] [transform-style:preserve-3d] [transform:translateZ(130px)_rotateZ(20deg)_rotateX(-58deg)] [&>span]:mb-[18px] [&>span]:block [&>span]:font-[var(--mono)] [&>span]:text-[10px] [&>span]:uppercase [&>span]:text-[var(--text-soft)] [&>strong]:text-[17px] [&>i]:mt-[10px] [&>i]:block [&>i]:h-1 [&>i]:w-[82%] [&>i]:bg-[var(--line-strong)] [&>i:last-child]:w-[54%]">
          <span>Key idea</span>
          <strong>Systems connect.</strong>
          <i />
          <i />
        </div>
        <div className="learning-plane absolute right-[-7%] top-[27%] z-4 min-h-[120px] w-[190px] rounded-lg border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--panel)_88%,transparent)] p-[18px] text-[var(--text)] shadow-[0_22px_55px_var(--shadow)] backdrop-blur-[13px] [transform-style:preserve-3d] [transform:translateZ(170px)_rotateZ(22deg)_rotateX(-58deg)] [&>span]:mb-[18px] [&>span]:block [&>span]:font-[var(--mono)] [&>span]:text-[10px] [&>span]:uppercase [&>span]:text-[var(--text-soft)] [&>div]:flex [&>div]:items-center [&>div]:gap-2 [&_b]:h-[26px] [&_b]:w-[26px] [&_b]:rounded-full [&_b]:bg-[var(--signal)] [&_em]:h-px [&_em]:w-[50px] [&_em]:bg-[var(--line-strong)]">
          <span>Process</span>
          <div><b /> <em /> <b /></div>
        </div>
        <div className="learning-plane absolute bottom-[1%] right-[17%] z-4 min-h-[120px] w-[190px] rounded-lg border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--panel)_88%,transparent)] p-[18px] text-[var(--text)] shadow-[0_22px_55px_var(--shadow)] backdrop-blur-[13px] [transform-style:preserve-3d] [transform:translateZ(110px)_rotateZ(18deg)_rotateX(-58deg)] [&>span]:mb-[18px] [&>span]:block [&>span]:font-[var(--mono)] [&>span]:text-[10px] [&>span]:uppercase [&>span]:text-[var(--text-soft)] [&>div]:grid [&>div]:grid-cols-2 [&>div]:gap-2 [&_i]:h-[55px] [&_i]:rounded [&_i]:bg-[var(--inquiry)] [&_i:last-child]:bg-[var(--signal)]">
          <span>Compare</span>
          <div><i /><i /></div>
        </div>
      </div>
    </div>
  );
}
