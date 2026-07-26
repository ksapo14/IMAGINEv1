const styles = {
  figure:
    "diagram-figure flex min-h-full flex-col text-[var(--diagram-ink)] [--diagram-ground:var(--canvas-surface)] [--diagram-ink:var(--canvas-text)] [--diagram-muted:var(--canvas-muted)] [--diagram-paper:var(--canvas-soft)] [background:radial-gradient(circle_at_8%_8%,color-mix(in_srgb,var(--diagram-muted)_10%,transparent),transparent_30%),linear-gradient(145deg,color-mix(in_srgb,var(--diagram-ground)_92%,transparent),var(--diagram-ground))]",
  header:
    "grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-3 border-b [border-color:color-mix(in_srgb,var(--diagram-muted)_22%,transparent)] px-6 pb-5 pt-6 max-[700px]:p-[1.15rem]",
  typeLabel:
    "mb-[0.35rem] block text-[0.7rem] font-bold uppercase tracking-[0.08em] text-[var(--diagram-muted)]",
  relationshipTitle:
    "mb-[0.35rem] block text-[0.7rem] font-bold uppercase tracking-[0.08em] text-[var(--diagram-muted)]",
  columnLabel:
    "mb-[0.35rem] block text-[0.7rem] font-bold uppercase tracking-[0.08em] text-[var(--diagram-muted)]",
  title:
    "m-0 text-balance text-[clamp(1.2rem,2vw,1.65rem)] font-[650] leading-[1.08] tracking-[-0.025em]",
  summary:
    "col-span-full m-0 max-w-[70ch] text-pretty text-[0.9rem] leading-[1.55] text-[var(--diagram-muted)]",
  nodeCount:
    "self-start whitespace-nowrap rounded-[0.45rem] border [border-color:color-mix(in_srgb,var(--diagram-muted)_22%,transparent)] px-[0.55rem] py-[0.35rem] text-[0.72rem] tabular-nums text-[var(--diagram-muted)]",
  body: "min-h-0 flex-1 overflow-auto p-[clamp(1rem,2.6vw,2rem)] max-[700px]:p-4",
  node:
    "diagram-node min-h-[8.5rem] w-[clamp(11.5rem,18vw,15.5rem)] rounded-[0.9rem] border [border-color:color-mix(in_srgb,var(--diagram-muted)_24%,transparent)] bg-[color-mix(in_srgb,var(--diagram-paper)_92%,transparent)] p-4 text-[var(--diagram-ink)] shadow-[0_1rem_2.5rem_color-mix(in_srgb,var(--canvas-bg)_18%,transparent)] max-[700px]:w-[11.5rem]",
  nodeMeta: "mb-[0.7rem] flex min-h-[1.35rem] items-center justify-between gap-2",
  nodeIndex:
    "grid h-[1.65rem] w-[1.65rem] place-items-center rounded-lg bg-[var(--diagram-ink)] text-[0.68rem] font-[750] tabular-nums text-[var(--canvas-bg)]",
  role:
    "text-[0.63rem] font-bold uppercase tracking-[0.07em] text-[var(--diagram-muted)]",
  nodeTitle:
    "m-0 text-balance text-[0.98rem] font-[680] leading-[1.25] tracking-[-0.012em]",
  nodeDescription:
    "mb-0 mt-2 text-pretty text-[0.78rem] leading-[1.48] text-[var(--diagram-muted)]",
  start:
    "border-l-[0.28rem] [border-left-color:color-mix(in_srgb,var(--diagram-muted)_70%,var(--diagram-ink))]",
  input:
    "border-l-[0.28rem] [border-left-color:color-mix(in_srgb,var(--diagram-muted)_70%,var(--diagram-ink))]",
  cause:
    "border-l-[0.28rem] [border-left-color:color-mix(in_srgb,var(--diagram-muted)_70%,var(--diagram-ink))]",
  end:
    "[border-color:color-mix(in_srgb,var(--diagram-ink)_46%,transparent)] bg-[color-mix(in_srgb,var(--diagram-paper)_76%,var(--diagram-ground))]",
  output:
    "[border-color:color-mix(in_srgb,var(--diagram-ink)_46%,transparent)] bg-[color-mix(in_srgb,var(--diagram-paper)_76%,var(--diagram-ground))]",
  effect:
    "[border-color:color-mix(in_srgb,var(--diagram-ink)_46%,transparent)] bg-[color-mix(in_srgb,var(--diagram-paper)_76%,var(--diagram-ground))]",
  decision:
    "border-dashed bg-[color-mix(in_srgb,var(--diagram-paper)_78%,var(--diagram-ground))]",
  process: "[border-top-color:color-mix(in_srgb,var(--diagram-muted)_36%,transparent)]",
  actor: "[border-top-color:color-mix(in_srgb,var(--diagram-muted)_36%,transparent)]",
  milestone:
    "[border-top-color:color-mix(in_srgb,var(--diagram-muted)_36%,transparent)] [&_.diagram-node-index]:tabular-nums",
  category:
    "[border-top-color:color-mix(in_srgb,var(--diagram-muted)_36%,transparent)]",
  horizontalViewport: "min-w-min",
  flowTrack: "m-0 flex list-none items-center p-0",
  flowItem: "flex items-center",
  connector:
    "flex w-[clamp(4rem,7vw,7rem)] flex-col items-center justify-center text-[var(--diagram-muted)]",
  arrow: "text-2xl font-light",
  edgeLabel:
    "max-w-[6.5rem] rounded-full border [border-color:color-mix(in_srgb,var(--diagram-muted)_20%,transparent)] bg-[var(--diagram-ground)] px-[0.45rem] py-1 text-center text-[0.64rem] font-[650] leading-[1.2] text-[var(--diagram-muted)]",
  feedbackRail:
    "mx-auto mb-0 mt-6 flex w-fit items-center gap-[0.55rem] rounded-[0.65rem] border border-dashed [border-color:color-mix(in_srgb,var(--diagram-muted)_35%,transparent)] px-[0.8rem] py-[0.55rem] text-xs text-[var(--diagram-muted)]",
  laneStack: "grid min-w-min gap-3",
  lane:
    "diagram-lane grid grid-cols-[9rem_minmax(0,1fr)] items-stretch overflow-hidden rounded-[0.85rem] border [border-color:color-mix(in_srgb,var(--diagram-muted)_18%,transparent)] max-[700px]:grid-cols-[6.5rem_minmax(0,1fr)]",
  laneTitle:
    "m-0 flex items-center border-r [border-color:color-mix(in_srgb,var(--diagram-muted)_18%,transparent)] bg-[color-mix(in_srgb,var(--diagram-paper)_48%,transparent)] p-4 text-[0.78rem] font-bold leading-[1.3] text-[var(--diagram-muted)] max-[700px]:p-[0.7rem]",
  laneTrack:
    "m-0 flex min-h-44 list-none items-center p-4 [&_.diagram-node]:min-h-[7.5rem] [&_.diagram-node]:w-[12.5rem]",
  relationships:
    "mt-4 border-t [border-color:color-mix(in_srgb,var(--diagram-muted)_18%,transparent)] pt-4",
  relationshipList: "m-0 flex list-none flex-wrap gap-2 p-0",
  relationship:
    "inline-flex items-center gap-[0.4rem] rounded-[0.55rem] bg-[color-mix(in_srgb,var(--diagram-paper)_70%,transparent)] px-[0.6rem] py-[0.45rem] text-[0.7rem] text-[var(--diagram-muted)] [&_em]:text-[0.65rem]",
  relationshipArrow: "text-[var(--diagram-ink)]",
  tree: "grid min-w-[42rem] gap-[3.4rem]",
  treeLevel:
    "relative flex justify-evenly gap-6 [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:-top-9 [&:not(:first-child)]:before:left-[10%] [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:w-4/5 [&:not(:first-child)]:before:bg-[color-mix(in_srgb,var(--diagram-muted)_36%,transparent)] [&:not(:first-child)]:before:content-['']",
  treeNodeWrap:
    "relative flex flex-col items-center [&:not(:only-child)]:before:absolute [&:not(:only-child)]:before:-top-9 [&:not(:only-child)]:before:h-9 [&:not(:only-child)]:before:w-px [&:not(:only-child)]:before:bg-[color-mix(in_srgb,var(--diagram-muted)_36%,transparent)] [&:not(:only-child)]:before:content-['']",
  branchLabels:
    "absolute -top-[1.8rem] flex -translate-y-1/2 gap-1 [&_span]:max-w-[6.5rem] [&_span]:rounded-full [&_span]:border [&_span]:[border-color:color-mix(in_srgb,var(--diagram-muted)_20%,transparent)] [&_span]:bg-[var(--diagram-ground)] [&_span]:px-[0.45rem] [&_span]:py-1 [&_span]:text-center [&_span]:text-[0.64rem] [&_span]:font-[650] [&_span]:leading-[1.2] [&_span]:text-[var(--diagram-muted)]",
  cycleWrap:
    "min-w-min rounded-[8rem] border border-dashed [border-color:color-mix(in_srgb,var(--diagram-muted)_30%,transparent)] p-4",
  cycleTrack: "m-0 flex list-none items-center gap-[0.65rem] p-[1.2rem]",
  cycleItem:
    "flex items-center gap-[0.65rem] last:[&_.diagram-cycle-arrow]:hidden [&_.diagram-node]:w-48",
  cycleIndex:
    "grid h-[1.65rem] w-[1.65rem] flex-none place-items-center rounded-full bg-[var(--diagram-ink)] text-[0.68rem] font-[750] tabular-nums text-[var(--canvas-bg)]",
  cycleArrow: "diagram-cycle-arrow text-2xl font-light",
  cycleReturn:
    "mx-auto mb-0 mt-6 flex w-fit items-center gap-[0.55rem] rounded-[0.65rem] border border-dashed [border-color:color-mix(in_srgb,var(--diagram-muted)_35%,transparent)] px-[0.8rem] py-[0.55rem] text-xs text-[var(--diagram-muted)]",
  timeline: "relative mx-auto grid max-w-4xl list-none gap-0 p-0",
  timelineItem:
    "relative grid min-h-[10.5rem] grid-cols-[2.25rem_minmax(0,1fr)] gap-5 [&_.diagram-node]:mb-5 [&_.diagram-node]:min-h-0 [&_.diagram-node]:w-full",
  timelineMarker:
    "z-[1] grid h-[1.65rem] w-[1.65rem] place-items-center rounded-full bg-[var(--diagram-ink)] text-[0.68rem] font-[750] tabular-nums text-[var(--canvas-bg)]",
  timelineLine:
    "absolute bottom-0 left-[0.81rem] top-[1.65rem] w-px bg-[color-mix(in_srgb,var(--diagram-muted)_44%,transparent)]",
  matrix:
    "grid min-w-[34rem] grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-3",
  matrixColumn:
    "diagram-matrix-column overflow-hidden rounded-[0.9rem] border [border-color:color-mix(in_srgb,var(--diagram-muted)_22%,transparent)]",
  matrixTitle:
    "m-0 border-b [border-color:color-mix(in_srgb,var(--diagram-muted)_22%,transparent)] bg-[color-mix(in_srgb,var(--diagram-paper)_60%,transparent)] px-4 py-[0.9rem] text-[0.8rem] font-[720]",
  matrixCells:
    "grid gap-[0.6rem] p-[0.6rem] [&_.diagram-node]:min-h-[7.5rem] [&_.diagram-node]:w-full [&_.diagram-node]:shadow-none",
  systemMap: "min-w-[44rem]",
  systemLayers: "grid gap-[0.65rem]",
  systemLayer:
    "diagram-system-layer grid grid-cols-[9rem_minmax(0,1fr)] items-center gap-4 rounded-[0.85rem] border [border-color:color-mix(in_srgb,var(--diagram-muted)_18%,transparent)] bg-[color-mix(in_srgb,var(--diagram-paper)_26%,transparent)] p-3",
  layerLabel:
    "[&_h4]:mb-0 [&_h4]:mt-1 [&_h4]:text-[0.82rem] [&_h4]:leading-[1.25] [&_span]:text-[0.65rem] [&_span]:tabular-nums [&_span]:text-[var(--diagram-muted)]",
  layerNodes:
    "grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-[0.65rem] [&_.diagram-node]:min-h-[7.5rem] [&_.diagram-node]:w-full [&_.diagram-node]:shadow-none",
  causeEffect:
    "grid min-w-[48rem] grid-cols-[minmax(13rem,1fr)_auto_minmax(13rem,1fr)_auto_minmax(13rem,1fr)] items-center gap-[0.85rem]",
  causeColumn:
    "grid content-center gap-[0.65rem] rounded-[0.9rem] bg-[color-mix(in_srgb,var(--diagram-paper)_36%,transparent)] p-[0.8rem] [&_.diagram-node]:min-h-[7.5rem] [&_.diagram-node]:w-full [&_.diagram-node]:shadow-none",
  mechanismColumn:
    "grid content-center gap-[0.65rem] rounded-[0.9rem] bg-[color-mix(in_srgb,var(--diagram-paper)_36%,transparent)] p-[0.8rem] [&_.diagram-node]:min-h-[7.5rem] [&_.diagram-node]:w-full [&_.diagram-node]:shadow-none",
  effectColumn:
    "grid content-center gap-[0.65rem] rounded-[0.9rem] bg-[color-mix(in_srgb,var(--diagram-paper)_36%,transparent)] p-[0.8rem] [&_.diagram-node]:min-h-[7.5rem] [&_.diagram-node]:w-full [&_.diagram-node]:shadow-none",
  causalArrow: "text-2xl font-light text-[var(--diagram-muted)]",
  empty:
    "grid min-h-80 place-items-center bg-[var(--diagram-ground)] text-[0.9rem] text-[var(--diagram-muted)]",
  motion:
    "motion-safe:[&_.diagram-node]:animate-diagram-enter motion-safe:[&_.diagram-lane]:animate-diagram-enter motion-safe:[&_.diagram-system-layer]:animate-diagram-enter motion-safe:[&_.diagram-matrix-column]:animate-diagram-enter motion-safe:[&_.diagram-node:nth-child(2)]:[animation-delay:70ms] motion-safe:[&_.diagram-system-layer:nth-child(2)]:[animation-delay:70ms] motion-safe:[&_.diagram-matrix-column:nth-child(2)]:[animation-delay:70ms] motion-safe:[&_.diagram-node:nth-child(3)]:[animation-delay:140ms] motion-safe:[&_.diagram-system-layer:nth-child(3)]:[animation-delay:140ms] motion-safe:[&_.diagram-matrix-column:nth-child(3)]:[animation-delay:140ms]"
} as const;

export type DiagramType =
  | "flowchart"
  | "swimlane"
  | "decisionTree"
  | "cycle"
  | "timeline"
  | "comparisonMatrix"
  | "systemMap"
  | "causeEffect";

export type DiagramNodeRole =
  | "process"
  | "start"
  | "end"
  | "decision"
  | "input"
  | "output"
  | "actor"
  | "milestone"
  | "cause"
  | "effect"
  | "category";

export type DiagramNode = {
  id: string;
  label: string;
  description: string;
  role: DiagramNodeRole;
  lane: string;
  group: string;
};

export type DiagramEdge = {
  source: string;
  target: string;
  label: string;
  kind: "direct" | "branch" | "feedback" | "association";
};

export type StructuredDiagramData = {
  version: 2;
  type: DiagramType;
  title: string;
  summary: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  lanes: Array<{ id: string; label: string }>;
};

type StructuredDiagramProps = {
  diagram: StructuredDiagramData;
  alt: string;
  motion: "subtle" | "none";
};

const typeLabels: Record<DiagramType, string> = {
  flowchart: "Flowchart",
  swimlane: "Swimlane",
  decisionTree: "Decision tree",
  cycle: "Cycle",
  timeline: "Timeline",
  comparisonMatrix: "Comparison matrix",
  systemMap: "System map",
  causeEffect: "Cause and effect"
};

function NodeCard({ node, index }: { node: DiagramNode; index?: number }) {
  return (
    <div
      className={`${styles.node} ${styles[node.role]}`}
      data-node-id={node.id}
    >
      <div className={styles.nodeMeta}>
        {typeof index === "number" ? (
          <span className={styles.nodeIndex}>{index + 1}</span>
        ) : null}
        <span className={styles.role}>{node.role}</span>
      </div>
      <h4 className={styles.nodeTitle}>{node.label}</h4>
      {node.description ? (
        <p className={styles.nodeDescription}>{node.description}</p>
      ) : null}
    </div>
  );
}

function Connector({ edge }: { edge?: DiagramEdge }) {
  return (
    <div className={styles.connector} aria-hidden="true">
      {edge?.label ? <span className={styles.edgeLabel}>{edge.label}</span> : null}
      <span className={styles.arrow}>→</span>
    </div>
  );
}

function edgeBetween(
  edges: DiagramEdge[],
  source: DiagramNode,
  target: DiagramNode
) {
  return edges.find(
    (edge) => edge.source === source.id && edge.target === target.id
  );
}

function RelationshipList({
  diagram,
  title = "Connections"
}: {
  diagram: StructuredDiagramData;
  title?: string;
}) {
  const nodesById = new Map(diagram.nodes.map((node) => [node.id, node]));
  const relationships = diagram.edges.filter(
    (edge) => nodesById.has(edge.source) && nodesById.has(edge.target)
  );
  if (relationships.length === 0) return null;

  return (
    <div className={styles.relationships}>
      <p className={styles.relationshipTitle}>{title}</p>
      <ul className={styles.relationshipList}>
        {relationships.map((edge, index) => (
          <li
            key={`${edge.source}-${edge.target}-${edge.kind}-${index}`}
            className={styles.relationship}
          >
            <span>{nodesById.get(edge.source)?.label}</span>
            <span className={styles.relationshipArrow} aria-hidden="true">
              {edge.kind === "feedback" ? "↺" : "→"}
            </span>
            {edge.label ? <em>{edge.label}</em> : null}
            <span>{nodesById.get(edge.target)?.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FlowchartDiagram({ diagram }: { diagram: StructuredDiagramData }) {
  const sequentialPairs = new Set(
    diagram.nodes.slice(0, -1).map(
      (node, index) => `${node.id}:${diagram.nodes[index + 1].id}`
    )
  );
  const branchEdges = diagram.edges.filter(
    (edge) =>
      edge.kind === "feedback" ||
      !sequentialPairs.has(`${edge.source}:${edge.target}`)
  );

  return (
    <div className={styles.horizontalViewport}>
      <ol className={styles.flowTrack}>
        {diagram.nodes.map((node, index) => (
          <li key={node.id} className={styles.flowItem}>
            <NodeCard node={node} index={index} />
            {index < diagram.nodes.length - 1 ? (
              <Connector
                edge={edgeBetween(
                  diagram.edges,
                  node,
                  diagram.nodes[index + 1]
                )}
              />
            ) : null}
          </li>
        ))}
      </ol>
      {diagram.edges.some((edge) => edge.kind === "feedback") ? (
        <div className={styles.feedbackRail}>
          <span aria-hidden="true">↺</span> Feedback returns to an earlier step
        </div>
      ) : null}
      {branchEdges.length > 0 ? (
        <RelationshipList
          diagram={{ ...diagram, edges: branchEdges }}
          title="Branches and loops"
        />
      ) : null}
    </div>
  );
}

function SwimlaneDiagram({ diagram }: { diagram: StructuredDiagramData }) {
  const lanes =
    diagram.lanes.some((lane) =>
      diagram.nodes.some((node) => (node.lane || "main") === lane.id)
    )
      ? diagram.lanes.filter((lane) =>
          diagram.nodes.some((node) => (node.lane || "main") === lane.id)
        )
      : [{ id: "main", label: "Main flow" }];
  const laneByNode = new Map(
    diagram.nodes.map((node) => [node.id, node.lane || "main"])
  );
  const handoffEdges = diagram.edges.filter(
    (edge) =>
      edge.kind === "feedback" ||
      laneByNode.get(edge.source) !== laneByNode.get(edge.target)
  );

  return (
    <div className={styles.laneStack}>
      {lanes.map((lane) => {
        const laneNodes = diagram.nodes.filter(
          (node) => (node.lane || "main") === lane.id
        );
        return (
          <section key={lane.id} className={styles.lane} aria-label={lane.label}>
            <h4 className={styles.laneTitle}>{lane.label}</h4>
            <ol className={styles.laneTrack}>
              {laneNodes.map((node, index) => (
                <li key={node.id} className={styles.flowItem}>
                  <NodeCard node={node} index={index} />
                  {index < laneNodes.length - 1 ? (
                    <Connector
                      edge={edgeBetween(
                        diagram.edges,
                        node,
                        laneNodes[index + 1]
                      )}
                    />
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        );
      })}
      {handoffEdges.length > 0 ? (
        <RelationshipList
          diagram={{ ...diagram, edges: handoffEdges }}
          title="Handoffs"
        />
      ) : null}
    </div>
  );
}

function getTreeLevels(diagram: StructuredDiagramData) {
  const nodesById = new Map(diagram.nodes.map((node) => [node.id, node]));
  const incoming = new Map(diagram.nodes.map((node) => [node.id, 0]));
  diagram.edges.forEach((edge) => {
    if (edge.kind !== "feedback" && incoming.has(edge.target)) {
      incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    }
  });
  let frontier = diagram.nodes
    .filter((node) => incoming.get(node.id) === 0)
    .map((node) => node.id);
  if (frontier.length === 0 && diagram.nodes[0]) frontier = [diagram.nodes[0].id];

  const visited = new Set<string>();
  const levels: DiagramNode[][] = [];
  while (frontier.length > 0) {
    const levelIds = [...new Set(frontier)].filter((id) => !visited.has(id));
    if (levelIds.length === 0) break;
    levelIds.forEach((id) => visited.add(id));
    levels.push(
      levelIds.map((id) => nodesById.get(id)).filter(Boolean) as DiagramNode[]
    );
    frontier = diagram.edges
      .filter(
        (edge) =>
          edge.kind !== "feedback" &&
          levelIds.includes(edge.source) &&
          !visited.has(edge.target)
      )
      .map((edge) => edge.target);
  }

  const unvisited = diagram.nodes.filter((node) => !visited.has(node.id));
  if (unvisited.length > 0) levels.push(unvisited);
  return levels;
}

function DecisionTreeDiagram({ diagram }: { diagram: StructuredDiagramData }) {
  const levels = getTreeLevels(diagram);
  return (
    <div className={styles.tree}>
      {levels.map((level, levelIndex) => (
        <div key={`level-${levelIndex}`} className={styles.treeLevel}>
          {level.map((node) => {
            const incomingEdges = diagram.edges.filter(
              (edge) => edge.target === node.id && edge.kind !== "feedback"
            );
            return (
              <div key={node.id} className={styles.treeNodeWrap}>
                {levelIndex > 0 ? (
                  <div className={styles.branchLabels}>
                    {incomingEdges.map((edge) => (
                      <span key={`${edge.source}-${edge.target}`}>
                        {edge.label || "then"}
                      </span>
                    ))}
                  </div>
                ) : null}
                <NodeCard node={node} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CycleDiagram({ diagram }: { diagram: StructuredDiagramData }) {
  return (
    <div className={styles.cycleWrap}>
      <ol className={styles.cycleTrack}>
        {diagram.nodes.map((node, index) => (
          <li key={node.id} className={styles.cycleItem}>
            <span className={styles.cycleIndex}>{index + 1}</span>
            <NodeCard node={node} />
            <span className={styles.cycleArrow} aria-hidden="true">
              →
            </span>
          </li>
        ))}
      </ol>
      <div className={styles.cycleReturn}>
        <span aria-hidden="true">↺</span>
        <span>
          {diagram.edges.find((edge) => edge.kind === "feedback")?.label ||
            "The final stage restarts the cycle"}
        </span>
      </div>
    </div>
  );
}

function TimelineDiagram({ diagram }: { diagram: StructuredDiagramData }) {
  return (
    <ol className={styles.timeline}>
      {diagram.nodes.map((node, index) => (
        <li key={node.id} className={styles.timelineItem}>
          <div className={styles.timelineMarker}>{index + 1}</div>
          <NodeCard node={node} />
          {index < diagram.nodes.length - 1 ? (
            <span className={styles.timelineLine} aria-hidden="true" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function groupedNodes(nodes: DiagramNode[]) {
  const groups = new Map<string, DiagramNode[]>();
  nodes.forEach((node) => {
    const group = node.group || "Overview";
    groups.set(group, [...(groups.get(group) ?? []), node]);
  });
  return [...groups.entries()];
}

function ComparisonMatrixDiagram({ diagram }: { diagram: StructuredDiagramData }) {
  return (
    <div className={styles.matrix}>
      {groupedNodes(diagram.nodes).map(([group, nodes]) => (
        <section key={group} className={styles.matrixColumn} aria-label={group}>
          <h4 className={styles.matrixTitle}>{group}</h4>
          <div className={styles.matrixCells}>
            {nodes.map((node) => (
              <NodeCard key={node.id} node={node} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SystemMapDiagram({ diagram }: { diagram: StructuredDiagramData }) {
  return (
    <div className={styles.systemMap}>
      <div className={styles.systemLayers}>
        {groupedNodes(diagram.nodes).map(([group, nodes], index) => (
          <section key={group} className={styles.systemLayer} aria-label={group}>
            <div className={styles.layerLabel}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h4>{group}</h4>
            </div>
            <div className={styles.layerNodes}>
              {nodes.map((node) => (
                <NodeCard key={node.id} node={node} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <RelationshipList diagram={diagram} />
    </div>
  );
}

function CauseEffectDiagram({ diagram }: { diagram: StructuredDiagramData }) {
  const causes = diagram.nodes.filter((node) => node.role === "cause");
  const effects = diagram.nodes.filter((node) => node.role === "effect");
  const mechanism = diagram.nodes.filter(
    (node) => node.role !== "cause" && node.role !== "effect"
  );

  return (
    <div className={styles.causeEffect}>
      <section className={styles.causeColumn} aria-label="Causes">
        <h4 className={styles.columnLabel}>Causes</h4>
        {(causes.length > 0 ? causes : diagram.nodes.slice(0, 1)).map((node) => (
          <NodeCard key={node.id} node={node} />
        ))}
      </section>
      <div className={styles.causalArrow} aria-hidden="true">
        →
      </div>
      <section className={styles.mechanismColumn} aria-label="Mechanism">
        <h4 className={styles.columnLabel}>Mechanism</h4>
        {(mechanism.length > 0
          ? mechanism
          : diagram.nodes.slice(1, -1)
        ).map((node) => (
          <NodeCard key={node.id} node={node} />
        ))}
      </section>
      <div className={styles.causalArrow} aria-hidden="true">
        →
      </div>
      <section className={styles.effectColumn} aria-label="Effects">
        <h4 className={styles.columnLabel}>Effects</h4>
        {(effects.length > 0 ? effects : diagram.nodes.slice(-1)).map((node) => (
          <NodeCard key={node.id} node={node} />
        ))}
      </section>
    </div>
  );
}

function DiagramBody({ diagram }: { diagram: StructuredDiagramData }) {
  switch (diagram.type) {
    case "swimlane":
      return <SwimlaneDiagram diagram={diagram} />;
    case "decisionTree":
      return <DecisionTreeDiagram diagram={diagram} />;
    case "cycle":
      return <CycleDiagram diagram={diagram} />;
    case "timeline":
      return <TimelineDiagram diagram={diagram} />;
    case "comparisonMatrix":
      return <ComparisonMatrixDiagram diagram={diagram} />;
    case "systemMap":
      return <SystemMapDiagram diagram={diagram} />;
    case "causeEffect":
      return <CauseEffectDiagram diagram={diagram} />;
    case "flowchart":
    default:
      return <FlowchartDiagram diagram={diagram} />;
  }
}

export function StructuredDiagram({
  diagram,
  alt,
  motion
}: StructuredDiagramProps) {
  if (!diagram.nodes.length) {
    return (
      <div role="status" className={styles.empty}>
        The diagram did not contain any steps.
      </div>
    );
  }

  return (
    <figure
      className={`${styles.figure} ${motion === "subtle" ? styles.motion : ""}`}
      aria-label={alt}
    >
      <figcaption className={styles.header}>
        <div>
          <span className={styles.typeLabel}>{typeLabels[diagram.type]}</span>
          <h3 className={styles.title}>{diagram.title}</h3>
        </div>
        <span className={styles.nodeCount}>
          {diagram.nodes.length} {diagram.nodes.length === 1 ? "node" : "nodes"}
        </span>
        {diagram.summary ? (
          <p className={styles.summary}>{diagram.summary}</p>
        ) : null}
      </figcaption>
      <div className={styles.body}>
        <DiagramBody diagram={diagram} />
      </div>
    </figure>
  );
}
