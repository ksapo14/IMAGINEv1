import type {
  DiagramMotion,
  VennDiagramData,
  VennRegionData
} from "../types";
import { DiagramFrame } from "./diagram-frame";

function RegionContent({ region }: { region: VennRegionData }) {
  return (
    <div className="max-w-48 text-center">
      <h4 className="m-0 text-sm font-semibold leading-tight">
        {region.heading}
      </h4>
      <ul className="mb-0 mt-2 grid list-none gap-1 p-0 text-[0.68rem] leading-4 text-[var(--canvas-muted)]">
        {region.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function VennDiagram({
  data,
  motion = "subtle"
}: {
  data: VennDiagramData;
  motion?: DiagramMotion;
}) {
  return (
    <DiagramFrame
      title={data.title}
      description={data.description}
      label="Venn diagram"
      motion={motion}
    >
      <div className="relative mx-auto h-[27rem] w-[39rem] min-w-[39rem]">
        <section className="diagram-enter absolute left-0 top-6 z-[1] grid aspect-square w-96 place-items-center rounded-full border-2 border-[var(--canvas-sage-border)] bg-[color-mix(in_srgb,var(--canvas-sage-bg)_76%,transparent)] p-12 pr-36">
          <RegionContent region={data.left} />
        </section>
        <section className="diagram-enter absolute left-60 top-6 z-[1] grid aspect-square w-96 place-items-center rounded-full border-2 border-[var(--canvas-indigo-border)] bg-[color-mix(in_srgb,var(--canvas-indigo-bg)_76%,transparent)] p-12 pl-36">
          <RegionContent region={data.right} />
        </section>
        <section className="diagram-enter absolute left-1/2 top-1/2 z-[2] grid w-36 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--canvas-surface)_82%,transparent)] p-3 backdrop-blur-sm">
          <RegionContent region={data.similar} />
        </section>
      </div>
    </DiagramFrame>
  );
}
