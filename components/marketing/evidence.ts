export const productWorkflow = [
  {
    index: "01",
    title: "Save lesson context",
    body: "Before class, save the lesson title, subject, and source material in the browser-local library."
  },
  {
    index: "02",
    title: "Interpret finalized speech",
    body: "Each completed teaching turn is interpreted against the saved lesson and the current board."
  },
  {
    index: "03",
    title: "Build one cumulative board",
    body: "The Live Assistant creates or updates a trusted stick scene without overlapping existing board work."
  }
];

export const sceneCapabilities = [
  { name: "Create", use: "Place a new idea in the next available board region" },
  { name: "Update", use: "Revise a related scene in its existing position" },
  { name: "Connect", use: "Show relationships with bounded labels and arrows" },
  { name: "Illustrate", use: "Optionally add one simple image when shapes are insufficient" }
];

export const educatorJobs = [
  "Show a process as it unfolds",
  "Compare two ideas without leaving the explanation",
  "Keep earlier ideas visible as the lesson develops",
  "Update a concept in place when the explanation deepens",
  "Skip a visual when the board already communicates the idea"
];

export const pilotMeasures = [
  "Context-entry effort",
  "Educator usability",
  "Scene decision reliability",
  "Lesson continuity",
  "A school-selected comprehension signal"
];
