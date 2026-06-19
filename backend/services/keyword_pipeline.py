import re
from dataclasses import dataclass


@dataclass(frozen=True)
class PitchFrame:
    title: str = ""
    subtitle: str = ""
    bullets: tuple[str, ...] = ()
    image_url: str = ""
    image_prompt: str = ""
    component_key: str = ""


@dataclass(frozen=True)
class PitchStep:
    keyword: str
    frame: PitchFrame
    aliases: tuple[str, ...] = ()


@dataclass
class PipelineResult:
    text: str
    imageUrl: str
    imagePrompt: str
    mode: str
    textMode: str
    status: str
    slideTitle: str
    slideSubtitle: str
    bullets: list[str]
    sequenceIndex: int
    totalSteps: int
    matchedKeyword: str
    componentKey: str


# Only the active step's keyword is ever scanned, which prevents overlap.
PITCH_SEQUENCE: tuple[PitchStep, ...] = (
    PitchStep(
        keyword="its beautiful",
        aliases=(
            "it's beautiful",
            "it is beautiful",
            "it was beautiful",
            "its beautifull",
            "it's beautifull",
            "it is beautifull",
            "it looks beautiful",
            "that looks beautiful",
            "is beautiful",
            "that's beautiful",
            "that is beautiful",
            "this is beautiful",
            "this was beautiful",
            "beautiful",
        ),
        frame=PitchFrame(
            title="NOBODY WANTS TO SIT THROUGH 40 SLIDES",
        ),
    ),
    PitchStep(
        keyword="imagineer",
        aliases=(
            "imagineers",
            "imagine here",
            "imagine ear",
            "imagine air",
            "imagine year",
            "imagine you",
            "imagine he",
            "imagine your",
            "imagine you're",
            "image in here",
            "image in you",
            "image in he",
            "image near",
            "im engineer",
            "we're imagineer",
            "we are imagineer",
            "were imagineer",
            "we are imagine you",
            "we are imagine he",
            "were imagine you",
            "were imagine he",
        ),
        frame=PitchFrame(
            image_url="/crappy_imagineer.png",
            image_prompt="Rough Imagineer handwritten logo",
        ),
    ),
    PitchStep(
        keyword="fix it",
        aliases=(
            "fixes it",
            "fixing it",
            "fixed it",
            "fix its",
            "fix this",
            "fixes this",
            "fixing this",
            "fixed this",
            "fix that",
            "fixes that",
            "fixing that",
            "fixed that",
            "fix the",
            "fixed the logo",
            "fix this logo",
            "fix that logo",
        ),
        frame=PitchFrame(
            image_url="/real_imagineer_logo.png",
            image_prompt="Polished Imagineer logo with tagline",
        ),
    ),
    PitchStep(
        keyword="overcomplicated frozen image",
        aliases=(
            "over complicated frozen image",
            "overcomplicated frozen images",
            "over complicated frozen images",
            "overcomplicated frozen picture",
            "over complicated frozen picture",
            "complicated frozen image",
            "frozen image",
            "frozen picture",
            "frozen diagram",
            "static frozen image",
            "overcomplicated diagram",
            "over complicated diagram",
            "complicated diagram",
            "overcomplicated still image",
            "over complicated still image",
        ),
        frame=PitchFrame(
            image_url="/chain_complicated.png",
            image_prompt="Overcomplicated frozen oxidative phosphorylation diagram",
        ),
    ),
    PitchStep(
        keyword="teachers burn hours",
        aliases=(
            "teacher burns hours",
            "teacher burn hours",
            "teachers burns hours",
            "teachers burned hours",
            "teachers burning hours",
            "teachers spend hours",
            "teachers waste hours",
            "teachers waste our",
            "teachers burn our",
            "teachers burned our",
            "teacher spend hours",
            "teacher spends hours",
            "teachers lose hours",
            "teacher loses hours",
            "burning hours",
            "burn hours",
        ),
        frame=PitchFrame(
            image_prompt="Stressed teacher and bored student during classroom preparation",
            component_key="teachers-burn-hours",
        ),
    ),
    PitchStep(
        keyword="phones",
        aliases=(
            "phone",
            "their phones",
            "students on phones",
            "students on their phones",
            "visually engaging technology",
            "most visually engaging technology",
            "technology ever created",
            "competing with phones",
            "teachers are competing with phones",
        ),
        frame=PitchFrame(
            title="Classrooms are competing with phones.",
            subtitle="The visual bar students live with all day is not static.",
            bullets=(
                "Fast visuals",
                "Constant motion",
                "Instant feedback",
            ),
            component_key="phones-vs-classroom",
        ),
    ),
    PitchStep(
        keyword="static slides",
        aliases=(
            "static slide",
            "static diagrams",
            "static diagram",
            "boring slideshow",
            "boring slideshows",
            "cluttered with text",
            "text cluttered slides",
            "classrooms still rely on static slides",
            "still rely on static slides and diagrams",
        ),
        frame=PitchFrame(
            title="Most classrooms still run on static slides.",
            subtitle="Dense text and frozen diagrams make hard ideas harder to see.",
            bullets=(
                "Text-heavy slides",
                "Frozen diagrams",
                "Low attention",
            ),
            component_key="static-slides",
        ),
    ),
    PitchStep(
        keyword="meet imagine",
        aliases=(
            "meet imagined",
            "meet imaging",
            "meat imagine",
            "everyone meet imagine",
            "everyone meets imagine",
            "everybody meet imagine",
            "everybody meets imagine",
            "everyone meet imaging",
            "everyone meet imagined",
            "meet the imagine",
            "need imagine",
        ),
        frame=PitchFrame(
            component_key="electron-transport-chain",
        ),
    ),
    PitchStep(
        keyword="running this entire presentation",
        aliases=(
            "running the entire presentation",
            "running this whole presentation",
            "running the whole presentation",
            "watching it work this whole time",
            "watching it work",
            "entire presentation",
            "this whole time",
            "run this whole show",
            "running this whole show",
            "running the whole show",
            "running this presentation",
            "run the presentation",
            "watching imagine work",
        ),
        frame=PitchFrame(
            title="IMAGINEv1",
            subtitle="A live assistant that listens to teachers, draws visuals, and places notes in real time.",
            bullets=(
                "Listens while educators teach naturally",
                "Draws visuals as ideas are spoken",
                "Places concise notes beside the visual flow",
            ),
            component_key="live-whiteboard",
        ),
    ),
    PitchStep(
        keyword="demo",
        aliases=(
            "beaker demo",
            "krish demo",
            "krish does his beaker demo",
            "start the demo",
            "start demo",
            "begin demo",
            "begin the demo",
            "demo time",
            "the demo",
        ),
        frame=PitchFrame(
            title="DEMO",
        ),
    ),
    PitchStep(
        keyword="beaker",
        aliases=(
            "beaker cup",
            "empty beaker",
            "blank beaker",
            "show beaker",
            "show the beaker",
            "bring up the beaker",
            "bring up beaker",
            "beaker glass",
            "beaker flask",
            "beaker vessel",
            "speaker",
            "beat her",
        ),
        frame=PitchFrame(
            image_url="/beaker.png",
            image_prompt="Empty beaker drawing",
            component_key="beaker-image",
        ),
    ),
    PitchStep(
        keyword="200ml water",
        aliases=(
            "200 ml water",
            "200 milliliters water",
            "two hundred ml water",
            "two hundred milliliters water",
            "200ml of water",
            "200 ml of water",
            "two hundred ml of water",
            "two hundred milliliters of water",
            "add 200ml water",
            "add 200 ml water",
            "add two hundred ml water",
            "beaker has 200ml water",
        ),
        frame=PitchFrame(
            image_url="/beaker_200ml.png",
            image_prompt="Beaker filled with 200ml of water",
            component_key="beaker-image",
        ),
    ),
    PitchStep(
        keyword="blue water",
        aliases=(
            "blue liquid",
            "water turns blue",
            "turns blue",
            "make the water blue",
            "make water blue",
            "blue colored water",
            "blue-coloured water",
            "colored blue water",
            "colour blue water",
            "dyed blue water",
            "dye the water blue",
            "now blue water",
        ),
        frame=PitchFrame(
            image_url="/beaker_blue.png",
            image_prompt="Beaker filled with blue water",
            component_key="beaker-image",
        ),
    ),
    PitchStep(
        keyword="bunsen burner",
        aliases=(
            "bunsen burn",
            "bunsen burning",
            "benson burner",
            "benson burn",
            "benson burning",
            "bunsen border",
            "bunsen birner",
            "burner",
            "gas burner",
            "blue flame",
            "heat the beaker",
            "heat up the beaker",
            "put it on the burner",
            "put the beaker on the burner",
        ),
        frame=PitchFrame(
            image_url="/beaker_bunsen.png",
            image_prompt="Beaker of blue water over a Bunsen burner",
            component_key="beaker-image",
        ),
    ),
    PitchStep(
        keyword="fundamentally changes that",
        aliases=(
            "imagine fundamentally changes that",
            "fundamentally changes this",
            "changes what a classroom is",
            "picture gets built with you",
            "built with you out loud",
            "built with you aloud",
            "built with you outloud",
            "second the idea is spoken",
            "idea is spoken",
            "the idea is spoken",
            "not making the old classroom faster",
            "old classroom faster",
            "changing what a classroom is",
        ),
        frame=PitchFrame(
            title="The picture gets built with you.",
            subtitle="Placeholder for the split-screen animation: static text on one side, live visual explanation on the other.",
            bullets=(
                "Left: a student stuck staring at text",
                "Right: the same idea drawing itself to life",
                "The classroom changes the second the idea is spoken",
            ),
            component_key="split-screen",
        ),
    ),
    PitchStep(
        keyword="whole room",
        aliases=(
            "the whole room",
            "listens to the whole room",
            "it listens to the whole room",
            "draws that too",
            "imagine draws that too",
            "draw that too",
            "draws it too",
            "draws this too",
            "draws that to",
            "discussion based class",
            "discussion base class",
            "discussion class",
            "belongs to everyone in it",
            "student makes a point",
            "student make a point",
            "student made a point",
        ),
        frame=PitchFrame(
            title="The conversation becomes the lesson.",
            subtitle="Placeholder for discussion mode: student speech bubbles become sketches on the board in real time.",
            bullets=(
                "Student comments are heard",
                "Useful ideas become quick visuals",
                "The board belongs to the whole room",
            ),
            component_key="discussion",
        ),
    ),
    PitchStep(
        keyword="school actually pays",
        aliases=(
            "schools actually pay",
            "school pays for this",
            "schools pay for this",
            "here is why a school pays",
            "why a school actually pays",
            "why schools actually pay",
            "why school pays",
            "school would pay",
            "schools would pay",
            "school will pay",
            "schools will pay",
        ),
        frame=PitchFrame(
            title="Why schools pay",
            subtitle="Time back for teachers, focus for students, stronger outcomes for schools.",
            bullets=(
                "Teachers get hours back every week",
                "Students stay focused because ideas become visible",
                "Higher scores lift school value",
            ),
            component_key="school-value",
        ),
    ),
    PitchStep(
        keyword="focus",
        aliases=(
            "focused",
            "student focus lead",
            "students focus leads",
            "focus leads to better understanding",
            "student focus leads",
            "stay focused",
            "students stay focused",
            "student stay focused",
            "students staying focused",
            "focused students",
        ),
        frame=PitchFrame(
            title="Better students make stronger schools.",
            bullets=(
                "Focus",
                "Understanding",
                "Scores",
                "Rankings",
                "Enrollment",
                "Revenue",
            ),
            component_key="value-flow-focus",
        ),
    ),
    PitchStep(
        keyword="understanding",
        aliases=(
            "understand",
            "understands",
            "better understanding",
            "student understanding",
            "better student understanding",
            "understood",
            "can see an idea understand",
            "see an idea understand",
            "students understand",
            "student understands",
            "student understanding improves",
        ),
        frame=PitchFrame(
            title="Better students make stronger schools.",
            bullets=(
                "Focus",
                "Understanding",
                "Scores",
                "Rankings",
                "Enrollment",
                "Revenue",
            ),
            component_key="value-flow-understanding",
        ),
    ),
    PitchStep(
        keyword="scores",
        aliases=(
            "score",
            "higher scores",
            "score higher",
            "they score higher",
            "student scores",
            "test scores",
            "scores higher",
            "higher score",
        ),
        frame=PitchFrame(
            title="Better students make stronger schools.",
            bullets=(
                "Focus",
                "Understanding",
                "Scores",
                "Rankings",
                "Enrollment",
                "Revenue",
            ),
            component_key="value-flow-scores",
        ),
    ),
    PitchStep(
        keyword="rankings",
        aliases=(
            "ranking",
            "rank",
            "ranks",
            "higher rankings",
            "lift rankings",
            "rankings drive",
            "ranking drive",
            "rankings rise",
            "ranking rise",
            "school rankings",
            "school ranking",
        ),
        frame=PitchFrame(
            title="Better students make stronger schools.",
            bullets=(
                "Focus",
                "Understanding",
                "Scores",
                "Rankings",
                "Enrollment",
                "Revenue",
            ),
            component_key="value-flow-rankings",
        ),
    ),
    PitchStep(
        keyword="enrollment",
        aliases=(
            "enrollments",
            "enrolment",
            "enrolments",
            "enrollment drive",
            "drive enrollment",
            "drives enrollment",
            "driving enrollment",
            "school enrollment",
            "enrollment grows",
        ),
        frame=PitchFrame(
            title="Better students make stronger schools.",
            bullets=(
                "Focus",
                "Understanding",
                "Scores",
                "Rankings",
                "Enrollment",
                "Revenue",
            ),
            component_key="value-flow-enrollment",
        ),
    ),
    PitchStep(
        keyword="revenue",
        aliases=(
            "revenues",
            "drive revenue",
            "revenue follows",
            "that follows",
            "drives revenue",
            "driving revenue",
            "school revenue",
            "revenue grows",
            "revenue that follows",
        ),
        frame=PitchFrame(
            title="Better students make stronger schools.",
            bullets=(
                "Focus",
                "Understanding",
                "Scores",
                "Rankings",
                "Enrollment",
                "Revenue",
            ),
            component_key="value-flow-revenue",
        ),
    ),
    PitchStep(
        keyword="now the model",
        aliases=(
            "now the pricing model",
            "pricing model consists",
            "our pricing model consists",
            "speaking about revenue",
            "speaking of revenue",
            "the model",
            "pricing model",
            "price model",
            "business model",
            "revenue model",
            "now our model",
            "model consists",
            "we charge schools",
        ),
        frame=PitchFrame(
            title="Simple pricing.",
            component_key="pricing-model-intro",
        ),
    ),
    PitchStep(
        keyword="school",
        aliases=(
            "schools",
            "charge schools",
            "hundred dollars",
            "one hundred dollars",
            "hundred dollars per teacher",
            "one hundred dollars per teacher",
            "hundred dollars a month",
            "one hundred dollars a month",
            "hundred per month",
            "one hundred per month",
            "school license",
            "school pricing",
            "100 dollars",
        ),
        frame=PitchFrame(
            title="Simple pricing.",
            component_key="pricing-model-school",
        ),
    ),
    PitchStep(
        keyword="individual teachers",
        aliases=(
            "individual teacher",
            "thirty nine",
            "thirty-nine",
            "39",
            "teacher can start",
            "teachers can start",
            "individual option",
            "individualized option",
            "individualized",
            "flexible option",
            "teacher pricing",
            "teacher plan",
            "thirty nine dollars",
            "thirty-nine dollars",
        ),
        frame=PitchFrame(
            title="Simple pricing.",
            component_key="pricing-model-teacher",
        ),
    ),
    PitchStep(
        keyword="seven dollars a month",
        aliases=(
            "seven dollar a month",
            "seven dollars per month",
            "seven dollar per month",
            "costs us about seven dollars",
            "cost per user at seven dollars",
            "margin above ninety percent",
            "ninety percent margin",
            "seven bucks a month",
            "seven bucks per month",
            "seven dollar monthly",
            "token usage",
            "monthly token usage",
            "thick profit margins",
            "profit margins",
        ),
        frame=PitchFrame(
            title="Built for margin.",
            subtitle="$7 monthly cost against a $100 monthly school price.",
            bullets=(
                "$100 price",
                "$7 estimated cost",
                ">90% gross margin",
            ),
            component_key="margin-chart",
        ),
    ),
    PitchStep(
        keyword="tuition paying schools",
        aliases=(
            "tuition paying school",
            "tuition paid schools",
            "private schools",
            "prestigious schools",
            "schools who adopt technology",
            "education software",
            "tuition paying",
            "tuition paid",
            "tuition based schools",
            "tuition-based schools",
            "private school",
            "independent schools",
            "independent school",
            "beachhead",
        ),
        frame=PitchFrame(
            title="Start where adoption is fastest.",
            subtitle="Placeholder for a falling collage of target school logos.",
            component_key="school-collage",
        ),
    ),
    PitchStep(
        keyword="teacher next door",
        aliases=(
            "show the teacher next door",
            "teacher saves six hours",
            "saves six hours",
            "not keeping that secret",
            "teachers become our sales team",
            "become our sales team",
        ),
        frame=PitchFrame(
            title="Teachers become the sales team.",
            subtitle="Every saved hour becomes a hallway demo.",
            component_key="sales-flow-teacher",
        ),
    ),
    PitchStep(
        keyword="department chair",
        aliases=(
            "the department chair",
            "department head",
            "department lead",
            "dept chair",
            "dept. chair",
            "chair sees it",
            "department chair sees it",
        ),
        frame=PitchFrame(
            title="Teacher adoption moves upward.",
            subtitle="The department chair sees what is happening next.",
            component_key="sales-flow-department-chair",
        ),
    ),
    PitchStep(
        keyword="principal",
        aliases=(
            "the principal",
            "principal sees",
            "principal sees classrooms",
            "principal sees classrooms running",
            "classrooms running on it",
            "school leader",
        ),
        frame=PitchFrame(
            title="Then the principal sees classrooms running on it.",
            subtitle="One classroom becomes institutional proof.",
            component_key="sales-flow-principal",
        ),
    ),
    PitchStep(
        keyword="pilots",
        aliases=(
            "pilot",
            "run pilots",
            "start pilots",
            "start with pilots",
            "handful of innovative private schools",
            "innovative private schools",
        ),
        frame=PitchFrame(
            title="Start with pilots.",
            subtitle="A small number of innovative schools becomes the launch point.",
            component_key="pilot-expansion-pilots",
        ),
    ),
    PitchStep(
        keyword="results",
        aliases=(
            "measure results",
            "measured results",
            "measure the results",
            "student results",
            "school results",
            "pilot results",
        ),
        frame=PitchFrame(
            title="Measure results.",
            subtitle="Proof matters more than a sales pitch.",
            component_key="pilot-expansion-results",
        ),
    ),
    PitchStep(
        keyword="case studies",
        aliases=(
            "case study",
            "turn successful classrooms into case studies",
            "successful classrooms into case studies",
            "successful classroom into case study",
            "classroom case studies",
        ),
        frame=PitchFrame(
            title="Turn classrooms into case studies.",
            subtitle="Each successful room becomes evidence for the next school.",
            component_key="pilot-expansion-case-studies",
        ),
    ),
    PitchStep(
        keyword="expansion",
        aliases=(
            "expand",
            "begin to expand",
            "expand school by school",
            "school by school",
            "from there",
            "pilots results case studies equals expansion",
            "case studies equals expansion",
        ),
        frame=PitchFrame(
            title="Pilots + Results + Case Studies = Expansion",
            subtitle="The go-to-market loop compounds school by school.",
            component_key="pilot-expansion-expansion",
        ),
    ),
    PitchStep(
        keyword="total",
        aliases=(
            "total market",
            "total addressable",
            "how big is this",
            "better with numbers",
            "two point four billion",
            "2.4 billion",
            "total addressable market value",
            "total addressable market",
            "tam value",
            "market value",
            "how big is this market",
            "how big this market",
            "big is this market",
        ),
        frame=PitchFrame(
            title="$2.4 BILLION / YEAR",
            subtitle="Dude. That's a lot of money.",
            component_key="market-total",
        ),
    ),
    PitchStep(
        keyword="calculations",
        aliases=(
            "show you its calculations",
            "show you the calculations",
            "show its calculations",
            "show the calculations",
            "show you how it calculates",
            "calculation",
            "calculated",
            "calculate it",
            "calculate this",
            "the math",
            "show the math",
            "show you the math",
            "show its math",
            "how we get there",
            "tam calculations",
            "market calculations",
            "chart pops up",
        ),
        frame=PitchFrame(
            title="How we get to $2.4B.",
            bullets=(
                "Reachable teacher seats",
                "Annual price per seat",
                "Total addressable market",
            ),
            component_key="tam-calc",
        ),
    ),
    PitchStep(
        keyword="first kind",
        aliases=(
            "first of its kind",
            "none of these tools generate visuals live",
            "none of these tools generate visuals live as teaching happens",
            "tools that generate visuals",
            "canva google slides or chatgpt",
            "canva slides or chatgpt",
            "google slides or chatgpt",
            "generate visuals live",
            "visuals live",
            "live as teaching happens",
            "live while teaching happens",
            "first in its category",
            "new category",
            "live during teaching",
            "competitive table",
            "firstcon",
        ),
        frame=PitchFrame(
            title="Imagine is live while teaching happens.",
            subtitle="Placeholder for the competitive table against Canva, Google Slides, and ChatGPT.",
            bullets=(
                "Canva: visuals, but not live teaching",
                "Google Slides: prepared slides, not real-time",
                "ChatGPT: generates content, but does not run the room",
                "Imagine: live visuals, room listening, zero prep",
            ),
            component_key="competitive-table",
        ),
    ),
    PitchStep(
        keyword="right here in the triangle",
        aliases=(
            "here in the triangle",
            "right here in triangle",
            "map pin on durham",
            "durham north carolina",
            "durham nc",
            "durham academy",
            "triangle",
            "the triangle",
            "right here triangle",
            "here in triangle",
            "triangle area",
            "durham",
            "map on durham",
            "map pin durham",
        ),
        frame=PitchFrame(
            title="Launch close to home.",
            subtitle="Placeholder map pin on Durham, NC.",
            component_key="durham-map",
        ),
    ),
    PitchStep(
        keyword="classroom",
        aliases=(
            "a classroom",
            "the classroom",
            "stop at a classroom",
            "in a classroom",
            "class room",
            "classrooms",
            "class rooms",
            "in classrooms",
            "at a classroom",
        ),
        frame=PitchFrame(
            title="Classrooms",
            subtitle="Live visuals for everyday teaching.",
            component_key="use-case-classroom",
        ),
    ),
    PitchStep(
        keyword="lecture hall",
        aliases=(
            "a lecture hall",
            "university lecture hall",
            "college lecture hall",
            "lecture halls",
            "lecture haul",
            "lecture room",
            "university lecture",
            "college lecture",
            "a lecture",
            "whats that call"
        ),
        frame=PitchFrame(
            title="Lecture halls",
            subtitle="Complex ideas at auditorium scale.",
            component_key="use-case-lecture-hall",
        ),
    ),
    PitchStep(
        keyword="boardroom",
        aliases=(
            "a boardroom",
            "corporate boardroom",
            "board room",
            "conference room",
            "boardrooms",
            "board rooms",
            "conference rooms",
            "corporate board room",
            "meeting room",
        ),
        frame=PitchFrame(
            title="Boardrooms",
            subtitle="Live diagrams for teams explaining hard decisions.",
            component_key="use-case-boardroom",
        ),
    ),
    PitchStep(
        keyword="keynote stage",
        aliases=(
            "a keynote stage",
            "ted style stage",
            "ted stage",
            "keynote",
            "key note stage",
            "key note",
            "keynotes",
            "presentation stage",
            "main stage",
            "stage",
        ),
        frame=PitchFrame(
            title="Keynote stages",
            subtitle="A new way to explain ideas to any audience.",
            component_key="use-case-keynote",
        ),
    ),
    PitchStep(
        keyword="ceo",
        aliases=(
            "c e o",
            "chief executive officer",
            "i am vivaan ceo",
            "i'm vivaan ceo",
            "vivaan ceo",
            "vivaan",
            "vivian ceo",
            "vivian",
            "vivan ceo",
            "vivan",
            "viva ceo",
            "chief executive",
        ),
        frame=PitchFrame(
            title="Vivaan",
            subtitle="CEO",
            component_key="team-vivaan",
        ),
    ),
    PitchStep(
        keyword="cfo",
        aliases=(
            "c f o",
            "chief financial officer",
            "jackson",
            "jackson c f o",
            "jackson cfo",
            "i am jackson cfo",
            "i'm jackson cfo",
            "jackson chief financial officer",
            "jackson finance",
            "jackson financial",
            "jacks in cfo",
            "jaxon cfo",
            "jaxon",
        ),
        frame=PitchFrame(
            title="Jackson",
            subtitle="CFO",
            component_key="team-jackson",
        ),
    ),
    PitchStep(
        keyword="cto",
        aliases=(
            "c t o",
            "chief technology officer",
            "krish",
            "krish c t o",
            "krish cto",
            "and krish cto",
            "i am krish cto",
            "i'm krish cto",
            "krish chief technology officer",
            "krish technology",
            "krish tech",
            "krish chief tech",
            "chris cto",
            "chris",
        ),
        frame=PitchFrame(
            title="Krish",
            subtitle="CTO",
            component_key="team-krish",
        ),
    ),
    PitchStep(
        keyword="bring it home",
        aliases=(
            "bring this home",
            "bring us home",
            "bring it to home",
            "bring at home",
            "bring home",
            "take it home",
            "take this home",
            "imagineered",
            "imagineering",
            "imagine it",
            "imagineer this",
            "imagineer that",
            "imagineer at",
            "imagineer hit",
            "imagine you it",
            "imagine he it",
            "imagine you're it",
            "imagine your it",
            "open your eyes and imagineer it",
            "open your eyes and imagineer",
            "open your eyes and imagine you it",
            "open your eyes and imagine he it",
            "open your eyes and imagine your it",
            "open your eyes and imagine you're it",
            "open your eyes imagineer it",
            "open your eyes imagineer",
            "open your eyes imagine you it",
            "open your eyes imagine he it",
            "thank you",
        ),
        frame=PitchFrame(
            title="Open your eyes, and imagineer it.",
            subtitle="Thank you.",
            component_key="final-thanks",
        ),
    ),
)


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def _words(value: str) -> tuple[str, ...]:
    value = re.sub(r"['’]", "", value.lower())
    return tuple(re.findall(r"[a-z0-9]+", value.lower()))


def _word_matches(actual: str, expected: str) -> bool:
    if actual == expected:
        return True

    if expected == "fix":
        return actual in {"fix", "fixes", "fixing", "fixed"}

    if expected == "it":
        return actual in {"it", "its", "this", "that", "the", "hit"}

    if expected == "its":
        return actual in {"its", "it", "is", "this", "thats", "that"}

    if expected == "beautiful":
        return actual in {"beautiful", "beautifull", "beautifully"}

    if expected == "imagineer":
        return actual in {
            "imagineer",
            "imagineers",
            "imaginer",
            "imagineered",
            "imagineering",
        }

    if expected == "meet":
        return actual in {"meet", "meets", "met", "meat"}

    if expected == "imagine":
        return actual in {"imagine", "imagined", "imaging"}

    if expected == "image":
        return actual in {"image", "images", "picture", "pictures"}

    if expected == "teachers":
        return actual in {"teacher", "teachers"}

    if expected == "burn":
        return actual in {"burn", "burns", "burned", "burning", "spend", "spends", "spent", "waste", "wastes", "wasted"}

    if expected == "hours":
        return actual in {"hour", "hours"}

    word_variants = {
        "fundamentally": {"fundamentally", "fundamental"},
        "demo": {"demo", "demonstration"},
        "phones": {"phone", "phones"},
        "static": {"static", "stagnant"},
        "slides": {"slide", "slides", "slideshow", "slideshows"},
        "beaker": {"beaker", "beakers"},
        "200ml": {"200ml", "200", "twohundred"},
        "200": {"200", "200ml", "twohundred"},
        "two": {"two", "2"},
        "hundred": {"hundred", "100"},
        "ml": {"ml", "milliliter", "milliliters", "millilitre", "millilitres"},
        "m": {"m"},
        "l": {"l"},
        "water": {"water"},
        "blue": {"blue"},
        "bunsen": {"bunsen", "benson"},
        "burner": {"burner", "burners", "burn", "burning"},
        "changes": {"change", "changes", "changed", "changing"},
        "whole": {"whole", "hole"},
        "room": {"room", "rooms"},
        "school": {"school", "schools"},
        "schools": {"school", "schools"},
        "actually": {"actually", "actual"},
        "pays": {"pay", "pays", "paid", "paying"},
        "focus": {"focus", "focused", "focusing"},
        "understanding": {"understanding", "understand", "understands", "understood"},
        "scores": {"score", "scores", "scored", "scoring"},
        "rankings": {"ranking", "rankings", "rank", "ranks"},
        "enrollment": {"enrollment", "enrollments", "enrolment", "enrolments", "enroll", "enrolling"},
        "revenue": {"revenue", "revenues"},
        "now": {"now"},
        "model": {"model", "models", "modal"},
        "individual": {"individual", "individuals", "individualized", "individualised"},
        "seven": {"seven", "7"},
        "dollars": {"dollar", "dollars", "bucks"},
        "month": {"month", "monthly"},
        "tuition": {"tuition", "tution"},
        "paying": {"paying", "paid", "pay"},
        "total": {"total"},
        "calculations": {"calculation", "calculations", "calculate", "calculates", "calculated", "calculating", "calc"},
        "first": {"first", "1st", "furst"},
        "kind": {"kind", "kinds", "category"},
        "right": {"right"},
        "here": {"here"},
        "triangle": {"triangle"},
        "classroom": {"classroom", "classrooms"},
        "lecture": {"lecture", "lectures"},
        "hall": {"hall", "halls", "haul"},
        "boardroom": {"boardroom", "boardrooms"},
        "keynote": {"keynote", "keynotes"},
        "stage": {"stage", "stages"},
        "ceo": {"ceo"},
        "cfo": {"cfo"},
        "cto": {"cto"},
        "department": {"department", "dept"},
        "chair": {"chair", "chairs"},
        "principal": {"principal", "principle"},
        "pilots": {"pilot", "pilots"},
        "results": {"result", "results"},
        "case": {"case", "cases"},
        "studies": {"study", "studies"},
        "expansion": {"expansion", "expand", "expanding"},
        "it": {"it", "hit"},
    }

    if expected in word_variants:
        return actual in word_variants[expected]

    return False


def _contains_keyword(text: str, keyword: str) -> bool:
    text_words = _words(text)
    keyword_words = _words(keyword)

    if not keyword_words or len(keyword_words) > len(text_words):
        return False

    for start in range(len(text_words) - len(keyword_words) + 1):
        if all(
            _word_matches(text_words[start + offset], keyword_words[offset])
            for offset in range(len(keyword_words))
        ):
            return True

    return False


def _contains_required_words(text: str, required_words: tuple[str, ...]) -> bool:
    text_words = _words(text)
    return all(
        any(_word_matches(actual_word, required_word) for actual_word in text_words)
        for required_word in required_words
    )


def _has_word(text_words: tuple[str, ...], expected_word: str) -> bool:
    return any(_word_matches(actual_word, expected_word) for actual_word in text_words)


def _contains_200ml_water(text: str) -> bool:
    text_words = _words(text)
    has_water = _has_word(text_words, "water")
    has_amount = (
        _has_word(text_words, "200ml")
        or _has_word(text_words, "200")
        or (_has_word(text_words, "two") and _has_word(text_words, "hundred"))
    )
    return has_water and has_amount


def _match_step_keyword(text: str, step: PitchStep) -> str:
    if step.keyword == "200ml water" and _contains_200ml_water(text):
        return step.keyword

    if step.keyword == "blue water" and _contains_required_words(text, ("blue", "water")):
        return step.keyword

    if step.keyword == "bunsen burner" and _contains_required_words(text, ("bunsen", "burner")):
        return step.keyword

    for keyword in (step.keyword, *step.aliases):
        if _contains_keyword(text, keyword):
            return step.keyword

    return ""


class KeywordPipeline:
    """Stateful ordered pitch sequence.

    The sequence only listens for the current step's keyword. Once that
    keyword is heard, the pipeline advances exactly one step and ignores all
    other configured keywords until the next request.
    """

    def __init__(self, steps: tuple[PitchStep, ...] = PITCH_SEQUENCE) -> None:
        self.steps = steps
        self.active_index = 0
        self.current_frame: PitchFrame | None = None
        self.last_consumed_speech = ""
        self.last_matched_keyword = ""

    def reset(self) -> dict[str, str | int | list[str]]:
        self.active_index = 0
        self.current_frame = None
        self.last_consumed_speech = ""
        self.last_matched_keyword = ""
        return self._result(status="unconfigured" if not self.steps else "waiting")

    async def generate(
        self,
        teacher_speech: str,
        reset_sequence: bool = False,
    ) -> dict[str, str | int | list[str]]:
        if reset_sequence:
            return self.reset()

        normalized_speech = _normalize_text(teacher_speech)
        status = "unconfigured" if not self.steps else "waiting"
        matched_keyword = ""

        active_step = self._active_step()
        scan_window = self._get_scan_window(normalized_speech)

        if active_step:
            matched_keyword = _match_step_keyword(scan_window, active_step)

        if active_step and matched_keyword:
            self.current_frame = active_step.frame
            self.last_consumed_speech = normalized_speech
            self.last_matched_keyword = active_step.keyword
            self.active_index += 1
            status = "complete" if self.active_index >= len(self.steps) else "advanced"
        elif self.active_index >= len(self.steps) and self.steps:
            status = "complete"

        return self._result(status=status, matched_keyword=matched_keyword)

    def _active_step(self) -> PitchStep | None:
        if self.active_index >= len(self.steps):
            return None

        return self.steps[self.active_index]

    def _get_scan_window(self, normalized_speech: str) -> str:
        if not normalized_speech:
            return ""

        if (
            self.last_consumed_speech and
            normalized_speech.startswith(self.last_consumed_speech)
        ):
            return normalized_speech[len(self.last_consumed_speech):].strip()

        if normalized_speech == self.last_consumed_speech:
            return ""

        return normalized_speech

    def _result(
        self,
        status: str,
        matched_keyword: str = "",
    ) -> dict[str, str | int | list[str]]:
        frame = self.current_frame

        result = PipelineResult(
            text="\n".join(frame.bullets) if frame else "",
            imageUrl=frame.image_url if frame else "",
            imagePrompt=frame.image_prompt if frame else "",
            mode="slide" if frame else "idle",
            textMode="keyword",
            status=status,
            slideTitle=frame.title if frame else "",
            slideSubtitle=frame.subtitle if frame else "",
            bullets=list(frame.bullets) if frame else [],
            sequenceIndex=self.active_index,
            totalSteps=len(self.steps),
            matchedKeyword=matched_keyword or self.last_matched_keyword,
            componentKey=frame.component_key if frame else "",
        )
        return result.__dict__
