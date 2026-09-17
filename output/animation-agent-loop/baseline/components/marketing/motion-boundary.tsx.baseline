"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePathname } from "next/navigation";

gsap.registerPlugin(ScrollTrigger);

export function MarketingMotionBoundary({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const scope = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useGSAP(
    () => {
      const heroNodes = gsap.utils.toArray<HTMLElement>("[data-hero]");
      const revealNodes = gsap.utils.toArray<HTMLElement>("[data-reveal]");
      const parallaxNodes = gsap.utils.toArray<HTMLElement>(
        "[data-parallax-media]"
      );
      const productFlowSteps = gsap.utils.toArray<HTMLElement>(
        "[data-product-flow-step]"
      );
      const motionMedia = gsap.matchMedia();
      motionMedia.add(
        {
          reduceMotion: "(prefers-reduced-motion: reduce)",
          allowMotion: "(prefers-reduced-motion: no-preference)",
          desktop: "(min-width: 901px)",
          finePointer: "(pointer: fine)"
        },
        (context) => {
          const {
            reduceMotion,
            allowMotion,
            desktop,
            finePointer
          } = context.conditions as {
            reduceMotion: boolean;
            allowMotion: boolean;
            desktop: boolean;
            finePointer: boolean;
          };
          const productFlow = scope.current?.querySelector<HTMLElement>(
            "[data-product-flow]"
          );
          const animatedNodes = [
            ...heroNodes,
            ...revealNodes,
            ...parallaxNodes,
            ...productFlowSteps
          ];

          if (reduceMotion) {
            gsap.set(animatedNodes, {
              opacity: 1,
              visibility: "visible",
              x: 0,
              y: 0,
              yPercent: 0,
              clearProps: "transform"
            });
            ScrollTrigger.refresh();
            return;
          }
          if (!allowMotion) {
            return;
          }

          gsap.from(heroNodes, {
            opacity: 0,
            y: 34,
            duration: 0.9,
            stagger: 0.1,
            ease: "power3.out"
          });

          revealNodes.forEach((node) => {
            gsap.fromTo(
              node,
              { opacity: 0, y: 24 },
              {
                opacity: 1,
                y: 0,
                duration: 0.72,
                ease: "power3.out",
                clearProps: "transform",
                scrollTrigger: {
                  trigger: node,
                  start: "top 88%",
                  once: true
                }
              }
            );
          });

          if (productFlow && productFlowSteps.length > 0) {
            gsap.fromTo(
              productFlowSteps,
              { opacity: 0, y: 34 },
              {
                opacity: 1,
                y: 0,
                duration: 0.72,
                stagger: 0.14,
                ease: "power3.out",
                clearProps: "transform",
                scrollTrigger: {
                  trigger: productFlow,
                  start: "top 82%",
                  once: true
                }
              }
            );
          }

          if (desktop && finePointer) {
            parallaxNodes.forEach((node) => {
              gsap.fromTo(
                node,
                { yPercent: -2 },
                {
                  yPercent: 3,
                  ease: "none",
                  scrollTrigger: {
                    trigger: node,
                    start: "top bottom",
                    end: "bottom top",
                    scrub: 0.7
                  }
                }
              );
            });
          }

          const refreshFrame = window.requestAnimationFrame(() =>
            ScrollTrigger.refresh()
          );
          return () => window.cancelAnimationFrame(refreshFrame);
        }
      );

      return () => motionMedia.revert();
    },
    { scope, dependencies: [pathname], revertOnUpdate: true }
  );

  return <div ref={scope}>{children}</div>;
}
