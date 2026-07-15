"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";

function hasLoaded() {
  try {
    return window.sessionStorage.getItem("imagine-loaded") === "true";
  } catch {
    return false;
  }
}

function markLoaded() {
  try {
    window.sessionStorage.setItem("imagine-loaded", "true");
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
}

export function LaunchLoader() {
  const [visible, setVisible] = useState(true);
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const loader = root.current;
    if (!loader) {
      return;
    }

    if (hasLoaded()) {
      setVisible(false);
      return;
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const siblingStates = Array.from(loader.parentElement?.children ?? [])
      .filter(
        (sibling): sibling is HTMLElement =>
          sibling instanceof HTMLElement && sibling !== loader
      )
      .map((element) => ({
        element,
        inert: element.inert,
        ariaHidden: element.getAttribute("aria-hidden")
      }));

    siblingStates.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    document.body.style.overflow = "hidden";
    loader.focus({ preventScroll: true });

    let tornDown = false;
    const teardown = () => {
      if (tornDown) {
        return;
      }

      tornDown = true;
      document.body.style.overflow = previousOverflow;
      siblingStates.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) {
          element.removeAttribute("aria-hidden");
        } else {
          element.setAttribute("aria-hidden", ariaHidden);
        }
      });
      if (document.activeElement === loader && previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };

    const finish = () => {
      try {
        markLoaded();
      } finally {
        teardown();
        setVisible(false);
      }
    };

    let context: gsap.Context | undefined;
    try {
      context = gsap.context(() => {
        const timeline = gsap.timeline({
          defaults: { ease: "power3.out" },
          onComplete: finish
        });

        if (reduceMotion) {
          timeline.to(loader, { opacity: 0, duration: 0.15 });
          return;
        }

        timeline
          .from(".loader-letter", {
            yPercent: 120,
            opacity: 0,
            duration: 0.72,
            stagger: 0.055
          })
          .to(".loader-progress", { scaleX: 1, duration: 0.82 }, "-=0.42")
          .to(".loader-word", { yPercent: -120, duration: 0.65 }, "+=0.1")
          .to(loader, { yPercent: -100, duration: 0.85 }, "-=0.46");
      }, root);
    } catch {
      finish();
    }

    return () => {
      try {
        context?.revert();
      } finally {
        teardown();
      }
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      ref={root}
      className="launch-loader"
      role="status"
      aria-label="Loading Imagine v1"
      tabIndex={-1}
    >
      <div className="loader-word" aria-hidden="true">
        {"IMAGINE V1".split("").map((letter, index) => (
          <span className="loader-letter" key={`${letter}-${index}`}>
            {letter === " " ? "\u00a0" : letter}
          </span>
        ))}
      </div>
      <div className="loader-track" aria-hidden="true">
        <span className="loader-progress" />
      </div>
    </div>
  );
}
