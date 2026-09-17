"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function MarketingSmoothScroll() {
  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    const updateScroll = () => ScrollTrigger.update();
    let lenis: Lenis | null = null;
    let updateFrame: ((time: number) => void) | null = null;

    const stopSmoothScroll = () => {
      if (!lenis || !updateFrame) {
        return;
      }
      lenis.off("scroll", updateScroll);
      gsap.ticker.remove(updateFrame);
      lenis.destroy();
      lenis = null;
      updateFrame = null;
    };

    const syncScrollMode = () => {
      if (reducedMotion.matches || coarsePointer.matches) {
        stopSmoothScroll();
        return;
      }
      if (lenis) {
        return;
      }

      lenis = new Lenis({
        lerp: 0.12,
        smoothWheel: true,
        syncTouch: false,
        anchors: { offset: -78 }
      });
      updateFrame = (time: number) => lenis?.raf(time * 1000);
      lenis.on("scroll", updateScroll);
      gsap.ticker.add(updateFrame);
      ScrollTrigger.refresh();
    };

    reducedMotion.addEventListener("change", syncScrollMode);
    coarsePointer.addEventListener("change", syncScrollMode);
    syncScrollMode();

    return () => {
      reducedMotion.removeEventListener("change", syncScrollMode);
      coarsePointer.removeEventListener("change", syncScrollMode);
      stopSmoothScroll();
    };
  }, []);

  return null;
}
