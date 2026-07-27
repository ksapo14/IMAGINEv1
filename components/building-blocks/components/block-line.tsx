import { Block } from "./block";
import type { BlockLineData } from "../types";

export function BlockLine({ data }: { data: BlockLineData }) {
  return (
    <ol
      className="m-0 flex min-w-max list-none items-center p-0"
      aria-label={`Flow line ${data.id}`}
    >
      {data.blocks.map((block, index) => (
        <li key={block.id} className="flex items-center">
          <Block data={block} />
          {index < data.blocks.length - 1 ? (
            <span
              className="mx-3 grid w-10 shrink-0 grid-cols-[1fr_auto] items-center text-[var(--canvas-muted)]"
              aria-hidden="true"
            >
              <span className="h-px bg-current" />
              <span className="-ml-px text-lg leading-none">›</span>
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
