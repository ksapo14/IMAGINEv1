import styles from "./structured-diagram.module.css";

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
