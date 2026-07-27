import { Block } from "../components";
import type { DiagramMotion, TreeData, TreeNodeData } from "../types";
import { DiagramFrame } from "./diagram-frame";

function TreeBranch({ node }: { node: TreeNodeData }) {
  const block = {
    type: "block" as const,
    id: node.id,
    heading: node.heading,
    description: node.description
  };

  return (
    <div className="relative flex flex-col items-center">
      <Block data={block} />
      {node.children.length > 0 ? (
        <>
          <span
            className="h-8 w-px bg-[var(--line-strong)]"
            aria-hidden="true"
          />
          <div className="relative flex items-start gap-6 border-t border-[var(--line-strong)] pt-8">
            {node.children.map((child) => (
              <div
                key={child.id}
                className="relative before:absolute before:-top-8 before:left-1/2 before:h-8 before:w-px before:bg-[var(--line-strong)] before:content-['']"
              >
                <TreeBranch node={child} />
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function Tree({
  data,
  motion = "subtle"
}: {
  data: TreeData;
  motion?: DiagramMotion;
}) {
  return (
    <DiagramFrame
      title={data.title}
      description={data.description}
      label="Tree"
      motion={motion}
    >
      <div className="min-w-max py-2">
        <TreeBranch node={data.root} />
      </div>
    </DiagramFrame>
  );
}
