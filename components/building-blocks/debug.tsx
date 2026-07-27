import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Block, BlockLine, Round } from "./components";
import { DiagramRenderer } from "./diagram-renderer";
import {
  blockLineSample,
  blockSample,
  flowchartSample,
  mindMapSample,
  pieSample,
  roundSample,
  treeSample,
  vennSample
} from "./sample-data";

function JsonInput({ data }: { data: object }) {
  return (
    <pre className="m-0 max-h-[34rem] overflow-auto rounded-2xl border border-[var(--line)] bg-[var(--page-deep)] p-4 font-mono text-[0.72rem] leading-5 text-[var(--text-soft)]">
      <code>{JSON.stringify(data, null, 2)}</code>
    </pre>
  );
}

function Showcase({
  name,
  summary,
  data,
  preview,
  tall = false
}: {
  name: string;
  summary: string;
  data: object;
  preview: ReactNode;
  tall?: boolean;
}) {
  return (
    <section className="grid gap-5 border-t border-[var(--line)] py-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
      <div>
        <h2 className="m-0 text-2xl font-semibold tracking-[-0.035em]">{name}</h2>
        <p className="mb-5 mt-2 max-w-[60ch] text-sm leading-6 text-[var(--text-soft)]">
          {summary}
        </p>
        <div
          className={`overflow-auto rounded-2xl bg-[var(--canvas-bg)] p-4 ${
            tall ? "h-[46rem]" : "min-h-64"
          }`}
        >
          {preview}
        </div>
      </div>
      <div>
        <p className="mb-3 mt-0 font-mono text-xs text-[var(--text-soft)]">
          JSON input
        </p>
        <JsonInput data={data} />
      </div>
    </section>
  );
}

export default function Debug() {
  return (
    <main className="min-h-[100dvh] bg-[var(--page)] text-[var(--text)]">
      <header className="sticky top-0 z-[2] border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--page)_92%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6">
          <span className="text-sm font-semibold">IMAGINE building blocks</span>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 pb-20 sm:px-6">
        <div className="max-w-3xl py-14">
          <h1 className="m-0 text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
            JSON in. Trusted components out.
          </h1>
          <p className="mb-0 mt-4 max-w-[62ch] text-base leading-7 text-[var(--text-soft)]">
            Every primitive and diagram below is rendered from the JSON printed beside it. Gemini can choose only from this library.
          </p>
        </div>

        <Showcase
          name="Block"
          summary="A rectangular content node with one heading and one description."
          data={blockSample}
          preview={
            <div className="grid min-h-56 place-items-center">
              <Block data={blockSample} />
            </div>
          }
        />
        <Showcase
          name="Round"
          summary="The circular content primitive used by mind maps."
          data={roundSample}
          preview={
            <div className="grid min-h-56 place-items-center">
              <Round data={roundSample} />
            </div>
          }
        />
        <Showcase
          name="BlockLine"
          summary="An ordered row of blocks. Connectors and arrows are application-owned."
          data={blockLineSample}
          preview={
            <div className="grid min-h-56 place-items-center overflow-auto p-4">
              <BlockLine data={blockLineSample} />
            </div>
          }
        />
        <Showcase
          name="Flowchart"
          summary="One or more block lines, with every line displayed below the previous line."
          data={flowchartSample}
          preview={
            <DiagramRenderer
              diagram={flowchartSample}
              alt="Cellular respiration flowchart"
            />
          }
          tall
        />
        <Showcase
          name="Tree"
          summary="A recursive root object whose children render as connected branches."
          data={treeSample}
          preview={<DiagramRenderer diagram={treeSample} alt="Types of matter tree" />}
          tall
        />
        <Showcase
          name="VennDiagram"
          summary="Two comparison regions plus one shared region in the overlap."
          data={vennSample}
          preview={
            <DiagramRenderer
              diagram={vennSample}
              alt="Plant and animal cell comparison"
            />
          }
          tall
        />
        <Showcase
          name="PieChart"
          summary="A variable number of labeled portions normalized to 100 percent."
          data={pieSample}
          preview={
            <DiagramRenderer diagram={pieSample} alt="Atmospheric composition" />
          }
          tall
        />
        <Showcase
          name="MindMap"
          summary="One central round with surrounding rounds connected by spokes."
          data={mindMapSample}
          preview={
            <DiagramRenderer diagram={mindMapSample} alt="Research planning mind map" />
          }
          tall
        />
      </div>
    </main>
  );
}
