"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  createScene,
  cumulativeBoardScene,
  lessonContextScene,
  MarketingScenePreview
} from "@/components/marketing/diagram-previews";

const modes = [
  {
    id: "context",
    index: "01",
    title: "Context",
    body: "Save the lesson context before class so live turns stay grounded.",
    scene: lessonContextScene,
    alt: "Stick-scene preview connecting saved lesson context and finalized speech to the live board."
  },
  {
    id: "live",
    index: "02",
    title: "Live",
    body: "Let finalized speech create a useful scene when the explanation calls for one.",
    scene: createScene,
    alt: "Stick-scene preview showing cellular energy moving from glucose through a cell to ATP."
  },
  {
    id: "cumulative",
    index: "03",
    title: "Cumulative",
    body: "Keep earlier scenes while related ideas are updated and new ones are placed.",
    scene: cumulativeBoardScene,
    alt: "Stick-scene preview connecting an earlier idea, an updated idea, and a new idea."
  }
] as const;

export function ProductModeAccordion() {
  const [activeMode, setActiveMode] = useState(0);
  const [stacked, setStacked] = useState(false);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 720px)");
    const updateLayout = () => setStacked(mobileQuery.matches);
    updateLayout();
    mobileQuery.addEventListener("change", updateLayout);
    return () => mobileQuery.removeEventListener("change", updateLayout);
  }, []);

  const selectMode = (index: number) => {
    setActiveMode(index);
    buttonRefs.current[index]?.focus();
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % modes.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + modes.length) % modes.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = modes.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      selectMode(nextIndex);
    }
  };

  return (
    <div className="marketing-mode-accordion" aria-label="Product modes">
      <div className="marketing-mode-accordion-controls">
        {modes.map((mode, index) => {
          const expanded = stacked || activeMode === index;
          return (
            <button
              key={mode.id}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              id={`product-mode-${mode.id}`}
              type="button"
              aria-expanded={expanded}
              aria-controls={`product-mode-panel-${mode.id}`}
              className={activeMode === index ? "is-active" : ""}
              onClick={() => setActiveMode(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <span>{mode.index}</span>
              <strong>{mode.title}</strong>
            </button>
          );
        })}
      </div>

      <div className="marketing-mode-accordion-panels">
        {modes.map((mode, index) => (
          <section
            key={mode.id}
            id={`product-mode-panel-${mode.id}`}
            role="region"
            aria-labelledby={`product-mode-${mode.id}`}
            className={activeMode === index ? "is-active" : ""}
          >
            <div>
              <p className="marketing-eyebrow">{mode.title}</p>
              <h3>{mode.body}</h3>
            </div>
            <MarketingScenePreview
              scene={mode.scene}
              alt={mode.alt}
              parallax={index === 0}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
