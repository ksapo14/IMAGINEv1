export function DiagramMotif({ variant = "branch" }: { variant?: "branch" | "orbit" }) {
  return (
    <div className={`marketing-diagram-motif motif-${variant}`} aria-hidden="true">
      <span className="motif-line line-a" />
      <span className="motif-line line-b" />
      <span className="motif-line line-c" />
      <i className="motif-node node-a" />
      <i className="motif-node node-b" />
      <i className="motif-node node-c" />
      <i className="motif-node node-d" />
    </div>
  );
}

const stages = [
  {
    index: "01",
    label: "Speech",
    content: "Energy moves from glucose into a form the cell can use."
  },
  {
    index: "02",
    label: "Live notes",
    content: "Glucose → cellular respiration → ATP"
  },
  {
    index: "03",
    label: "Visual",
    content: "A process diagram takes shape beside the explanation."
  }
];

export function StagedWalkthrough() {
  return (
    <figure className="marketing-walkthrough" aria-labelledby="walkthrough-caption">
      <figcaption id="walkthrough-caption">
        Illustrative product walkthrough — non-interactive
      </figcaption>
      <div className="walkthrough-stage-list">
        {stages.map((stage) => (
          <div key={stage.index} className="walkthrough-stage" data-stage>
            <div className="walkthrough-meta">
              <span>{stage.index}</span>
              <strong>{stage.label}</strong>
            </div>
            <p>{stage.content}</p>
            {stage.index === "03" ? (
              <div className="walkthrough-process" aria-hidden="true">
                <span>Glucose</span>
                <i />
                <span>ATP</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </figure>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <header className="marketing-section-heading" data-reveal>
      <p className="marketing-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {body ? <p className="marketing-lede">{body}</p> : null}
    </header>
  );
}
