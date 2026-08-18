"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  liveDiagram,
  MarketingDiagramPreview,
  prepareDiagram,
  recallDiagram
} from "@/components/marketing/diagram-previews";

const modes = [
  {
    id: "prepare",
    index: "01",
    title: "Prepare",
    body: "Turn lesson material into a small sequence of diagrams before class.",
    diagram: prepareDiagram,
    alt: "Flowchart preview showing glucose moving through cellular respiration to ATP."
  },
  {
    id: "live",
    index: "02",
    title: "Live",
    body: "Let finalized speech build notes and visuals as the explanation moves.",
    diagram: liveDiagram,
    alt: "Mind map preview connecting cellular respiration to its inputs, location, and output."
  },
  {
    id: "recall",
    index: "03",
    title: "Intentional recall",
    body: "Use an exact spoken phrase to reveal a diagram that was already prepared.",
    diagram: recallDiagram,
    alt: "Tree preview organizing a stored cellular energy diagram into inputs, process, and outputs."
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
            <MarketingDiagramPreview
              diagram={mode.diagram}
              alt={mode.alt}
              parallax={index === 0}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
