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
            "is beautiful",
            "that's beautiful",
            "that is beautiful",
            "this is beautiful",
            "beautiful",
        ),
        frame=PitchFrame(
            title="NOBODY WANTS TO LISTEN TO 40 SLIDES",
        ),
    ),
    PitchStep(
        keyword="imagineer",
        aliases=(
            "imagineers",
            "imagine here",
            "imagine ear",
            "we are imagineer",
            "were imagineer",
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
            "fix that",
            "fix the",
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
            "burn hours",
        ),
        frame=PitchFrame(
            image_url="/stressed_teacher.png",
            image_prompt="Stressed teacher buried in classroom preparation work",
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
            "meet the imagine",
        ),
        frame=PitchFrame(
            component_key="electron-transport-chain",
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
        return actual in {"it", "its", "this", "that", "the"}

    if expected == "its":
        return actual in {"its", "it", "is", "this", "thats", "that"}

    if expected == "beautiful":
        return actual in {"beautiful", "beautifull", "beautifully"}

    if expected == "imagineer":
        return actual in {"imagineer", "imagineers"}

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


def _match_step_keyword(text: str, step: PitchStep) -> str:
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
