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
    <div ref={scene} className="knowledge-scene" aria-hidden="true">
      <div className="knowledge-stage">
        <div className="knowledge-core">
          <span className="core-shell" />
          <span className="core-pulse" />
        </div>
        <div className="knowledge-ring knowledge-ring-a">
          <span className="knowledge-node node-one" />
          <span className="knowledge-node node-two" />
          <span className="knowledge-node node-three" />
        </div>
        <div className="knowledge-ring knowledge-ring-b">
          <span className="knowledge-node node-four" />
          <span className="knowledge-node node-five" />
          <span className="knowledge-node node-six" />
        </div>
        <div className="learning-plane plane-notes">
          <span>Key idea</span>
          <strong>Systems connect.</strong>
          <i />
          <i />
        </div>
        <div className="learning-plane plane-flow">
          <span>Process</span>
          <div><b /> <em /> <b /></div>
        </div>
        <div className="learning-plane plane-compare">
          <span>Compare</span>
          <div><i /><i /></div>
        </div>
      </div>
    </div>
  );
}
