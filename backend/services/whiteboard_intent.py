"""Bounded explicit-intent and shared-topic rules for a whiteboard turn."""

from dataclasses import dataclass
import re
from typing import Any


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
REMOVAL_VERB_PATTERN = re.compile(
    r"\b(?:remove|delete|drop)\b",
    re.IGNORECASE,
)
CLEAR_VERB_PATTERN = re.compile(r"\bclear\b", re.IGNORECASE)
POSITIVE_MODE_VERB_PATTERN = re.compile(
    r"\b(?:add|append|include|show|use|create|make|give|provide|keep|retain)\b",
    re.IGNORECASE,
)
ACTUALLY_CORRECTION_PATTERN = re.compile(
    r"(?:^|[.!?;:\n])\s*actually\b",
    re.IGNORECASE,
)
CORRECTION_PATTERNS = (
    re.compile(
        r"\b(?:correct|correction|fix|revise|revision|update|edit|replace|amend|"
        r"redraw|regenerate|recreate)\b",
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
REPLACEMENT_PATTERNS = (
    re.compile(
        r"\b(?:instead|only|just|remove|delete|drop|omit|exclude|redraw|regenerate|recreate)\b",
        re.IGNORECASE,
    ),
)
SEPARATE_CONTENT_PATTERN = re.compile(
    r"\b(?:reset|start\s+(?:over|fresh|again)|fresh\s+start|"
    r"(?:new|fresh|separate)\s+(?:page|board|whiteboard)|separate)\b",
    re.IGNORECASE,
)
# Remove presentation wording, never subject words or partial subject matches.
SUBJECT_FILLER_WORDS = frozenset(
    "a an the of on about for to in with and me my please can could would you "
    "give show make create draw provide tell explain describe summarize summarise "
    "add append include also now next then its it this that these those their "
    "main major key basic parts part overview brief concise short detailed "
    "how works work is are does do s".split()
)
GENERIC_SUBJECT_WORDS = frozenset("topic concept system process example section".split())


@dataclass(frozen=True)
class WhiteboardIntent:
    """Bounded cues that the server will enforce after the model responds."""

    required_modes: tuple[str, ...]
    forbidden_modes: tuple[str, ...]
    action: str | None
    force_integrate: bool
    force_replace: bool

    def prompt_contract(self) -> dict[str, object]:
        """Expose the same bounded constraints to the one model request."""
        return {
            "requiredContentModes": list(self.required_modes),
            "forbiddenContentModes": list(self.forbidden_modes),
            "action": self.action or "model-directed",
            "forceIntegrate": self.force_integrate,
            "forceReplace": self.force_replace,
        }


def allows_topic_continuity(user_input: str, intent: WhiteboardIntent) -> bool:
    """Keep replacement and fresh/separate requests outside automatic expansion."""
    return not intent.force_replace and not SEPARATE_CONTENT_PATTERN.search(user_input[:4000])


def _subject_words(text: str) -> frozenset[str]:
    """Compare complete subject word sets after removing format/request wording."""
    text = text[:4000].lower().replace("-", " ").replace("_", " ")
    for pattern in CONTENT_MODE_PATTERNS.values():
        text = pattern.sub(" ", text)
    return frozenset(re.findall(r"[^\W_]+", text)) - SUBJECT_FILLER_WORDS


def resolve_topic_continuity(
    user_input: str,
    context: dict[str, Any],
    intent: WhiteboardIntent,
) -> dict[str, Any] | None:
    """Anchor format follow-ups using bounded current scenes and recent prompts.

    Exact subject coverage handles ordinary rewording. Semantic synonyms remain
    model-directed; a shared generic word is never enough to merge two topics.
    """
    if not intent.required_modes or not allows_topic_continuity(user_input, intent):
        return None
    scenes = context["board"]["scenes"]
    recent_turns = context["recentTurns"]
    subject = _subject_words(user_input)
    if not subject and "notes" in intent.required_modes:
        # "Summarize its major parts" refers to the newest topic still present.
        # No sole-scene guess: a recent teaching anchor must actually exist.
        for turn in reversed(recent_turns):
            matches = [scene for scene in scenes if turn["conceptKey"]
                       and scene["conceptKey"] == turn["conceptKey"]]
            if len(matches) == 1:
                return matches[0]
        return None
    if not subject or subject <= GENERIC_SUBJECT_WORDS:
        return None

    matches = []
    for scene in scenes:
        evidence = [scene["title"], scene["conceptKey"]]
        evidence.extend(concept["title"] for concept in context["concepts"]
                        if concept["sceneId"] == scene["sceneId"])
        evidence.extend(turn["userInput"] for turn in recent_turns
                        if scene["conceptKey"] and turn["conceptKey"] == scene["conceptKey"])
        if any(subject == _subject_words(text) for text in evidence):
            matches.append(scene)
    return matches[0] if len(matches) == 1 else None


def _latest_clear_removal(local_prefix: str) -> int:
    """Return a verbal ``clear`` cue, excluding uses such as "a clear diagram"."""
    clear_matches = list(CLEAR_VERB_PATTERN.finditer(local_prefix))
    if not clear_matches:
        return -1

    latest_clear = clear_matches[-1]
    before_clear = local_prefix[:latest_clear.start()]
    after_clear = local_prefix[latest_clear.end():]
    has_positive_verb = POSITIVE_MODE_VERB_PATTERN.search(before_clear) is not None
    has_object_determiner = re.fullmatch(
        r"\s+(?:(?:the|this|that|all|existing|current|previous|last)\s+)+",
        after_clear,
        re.IGNORECASE,
    ) is not None
    return -1 if has_positive_verb and not has_object_determiner else latest_clear.start()


def _is_negated(text: str, cue_start: int) -> bool:
    """Apply negation across one bounded clause, regardless of phrase length."""
    local_prefix = CLAUSE_BOUNDARY_PATTERN.split(text[:cue_start])[-1]
    # "Not only/not just" adds content; remove only that token so a later
    # "no" or "without" in the same clause can still forbid another mode.
    negation_prefix = NON_EXCLUSIVE_NEGATION_PATTERN.sub("", local_prefix)
    if NEGATION_PATTERN.search(negation_prefix) is not None:
        return True

    # Removal verbs are negative mode operators. The closest explicit mode
    # verb wins so "remove the diagram and add notes" classifies each cue
    # independently while remaining inside the same bounded clause.
    removal_matches = list(REMOVAL_VERB_PATTERN.finditer(local_prefix))
    positive_matches = list(POSITIVE_MODE_VERB_PATTERN.finditer(local_prefix))
    latest_removal = max(
        removal_matches[-1].start() if removal_matches else -1,
        _latest_clear_removal(local_prefix),
    )
    latest_positive = positive_matches[-1].start() if positive_matches else -1
    return latest_removal > latest_positive


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
    replacement_text = NON_EXCLUSIVE_NEGATION_PATTERN.sub("", text)
    replacement = any(
        _latest_clear_removal(
            CLAUSE_BOUNDARY_PATTERN.split(text[:cue_start])[-1]
        ) >= 0
        for cue_start, _ in negative_cues
    )
    replacement = replacement or any(
        pattern.search(replacement_text) for pattern in REPLACEMENT_PATTERNS
    )
    # Additions retain the board, while Gemini still decides whether the new
    # material belongs in an existing scene or deserves a separate scene.
    action = "update" if correction or replacement else None
    return WhiteboardIntent(
        tuple(required_modes),
        tuple(forbidden_modes),
        action,
        additive or correction or replacement,
        correction or replacement,
    )
