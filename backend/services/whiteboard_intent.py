"""Deterministic explicit-intent policy for one whiteboard teaching turn."""

from dataclasses import dataclass
import re


CONTENT_MODE_PATTERNS = {
    "visual": re.compile(
        r"\b(?:visuals?|visualizations?|visualisations?|images?|illustrations?|pictures?)\b",
        re.IGNORECASE,
    ),
    "notes": re.compile(
        r"\b(?:summar(?:y|ies|ize|ise)|notes?|bullet(?:ed)?\s+(?:lists?|points?))\b",
        re.IGNORECASE,
    ),
    "diagram": re.compile(
        r"\b(?:diagrams?|flow\s*charts?|mind\s*maps?|process\s*maps?)\b",
        re.IGNORECASE,
    ),
}
NEGATION_PATTERN = re.compile(
    r"(?:\b(?:no|not|without|avoid|avoiding|skip|omit|exclude)\b|"
    r"\bdo\s+not\b|\bdon['’]?t\b|\binstead\s+of\b|\brather\s+than\b)",
    re.IGNORECASE,
)
CLAUSE_BOUNDARY_PATTERN = re.compile(
    r"[.!?;,:\n]|\b(?:but|however|yet|except|although|though|whereas|while|then)\b|"
    r"\binstead\b(?!\s+of)|\brather\b(?!\s+than)",
    re.IGNORECASE,
)
NON_EXCLUSIVE_NEGATION_PATTERN = re.compile(
    r"\bnot\s+(?:just|only)\b",
    re.IGNORECASE,
)
ACTUALLY_CORRECTION_PATTERN = re.compile(
    r"(?:^|[.!?;:\n])\s*actually\b",
    re.IGNORECASE,
)
CORRECTION_PATTERNS = (
    re.compile(
        r"\b(?:correct|correction|fix|revise|revision|update|edit|replace|amend)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bchange\s+(?:that|this|it|the|an?|existing|current|previous|last)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\bi\s+meant\b", re.IGNORECASE),
    re.compile(r"\bmake\s+(?:that|this|it)\b", re.IGNORECASE),
)
ADDITIVE_PATTERNS = (
    re.compile(r"\b(?:add|append)(?:\s+on)?\b", re.IGNORECASE),
    re.compile(
        r"\balso\s*,?\s*"
        r"(?:add|include|show|make|create|explain|teach|cover)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:another|additional|new)\s+"
        r"(?:diagram|summary|note|visual|section|compartment|scene|block|example|topic)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bseparate\s+(?:section|compartment|scene|block)\b",
        re.IGNORECASE,
    ),
)


@dataclass(frozen=True)
class WhiteboardIntent:
    """Bounded cues that the server will enforce after the model responds."""

    required_modes: tuple[str, ...]
    forbidden_modes: tuple[str, ...]
    action: str | None

    def prompt_contract(self) -> dict[str, object]:
        """Expose the same bounded constraints to the one model request."""
        return {
            "requiredContentModes": list(self.required_modes),
            "forbiddenContentModes": list(self.forbidden_modes),
            "action": self.action or "model-directed",
        }


def _is_negated(text: str, cue_start: int) -> bool:
    """Apply negation across one bounded clause, regardless of phrase length."""
    local_prefix = CLAUSE_BOUNDARY_PATTERN.split(text[:cue_start])[-1]
    # "Not only/not just" adds content; remove only that token so a later
    # "no" or "without" in the same clause can still forbid another mode.
    negation_prefix = NON_EXCLUSIVE_NEGATION_PATTERN.sub("", local_prefix)
    return NEGATION_PATTERN.search(negation_prefix) is not None


def classify_whiteboard_intent(user_input: str) -> WhiteboardIntent:
    """Classify only explicit cues; ordinary teaching language stays model-directed."""
    text = user_input[:4000]
    positive_cues: list[tuple[int, str]] = []
    negative_cues: list[tuple[int, str]] = []
    for mode, pattern in CONTENT_MODE_PATTERNS.items():
        for match in pattern.finditer(text):
            target = negative_cues if _is_negated(text, match.start()) else positive_cues
            target.append((match.start(), mode))

    forbidden = {mode for _, mode in negative_cues}
    required_modes: list[str] = []
    for _, mode in sorted(positive_cues):
        if mode not in forbidden and mode not in required_modes:
            required_modes.append(mode)
    forbidden_modes: list[str] = []
    for _, mode in sorted(negative_cues):
        if mode not in forbidden_modes:
            forbidden_modes.append(mode)

    correction = ACTUALLY_CORRECTION_PATTERN.search(text) is not None or any(
        pattern.search(text) for pattern in CORRECTION_PATTERNS
    )
    additive = any(pattern.search(text) for pattern in ADDITIVE_PATTERNS)
    action = "update" if correction else "create" if additive else None
    return WhiteboardIntent(tuple(required_modes), tuple(forbidden_modes), action)
