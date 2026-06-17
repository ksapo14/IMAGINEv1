import json
import os
import re
import time
import urllib.error
import urllib.request
import urllib.parse
from dataclasses import dataclass
from pathlib import Path

CELL_IMAGE_URL = "/cell.png"
CELL_IMAGE_PROMPT = "Local animal cell diagram"
CELL_TOPIC_PATTERN = re.compile(r"cell", flags=re.IGNORECASE)
NEURAL_NETWORK_IMAGE_URL = "/neuralnet.png"
NEURAL_NETWORK_IMAGE_PROMPT = "Local neural network layer diagram"
NEURAL_INPUT_LAYER_IMAGE_PROMPT = "Local neural network input layer focus diagram"
NEURAL_INPUT_LAYER_TOPIC_PATTERN = re.compile(
    r"\binput\s*layers?\b",
    flags=re.IGNORECASE,
)
NEURAL_NETWORK_TOPIC_PATTERN = re.compile(
    r"\b("
    r"neural\s*networks?|neural\s*nets?|neurons?|artificial\s*intelligence|"
    r"\bai\b|machine\s*learning|deep\s*learning|hidden\s*layers?|"
    r"input\s*layers?|output\s*layers?|weights?|biases?|activation\s*functions?|"
    r"backpropagation|perceptrons?|transformers?|convolutional|recurrent|"
    r"\bcnn\b|\brnn\b|\blstm\b|\bmlp\b|model\s*training"
    r")\b",
    flags=re.IGNORECASE,
)
AERODYNAMICS_IMAGE_URL = "/aerodynamics.png"
AERODYNAMICS_IMAGE_PROMPT = "Local aerodynamics airflow visualization"
AERODYNAMICS_TOPIC_PATTERN = re.compile(
    r"\b("
    r"aerodynamics?|air\s*flow|drag|lift|downforce|streamlines?|wind tunnel|"
    r"turbulence|laminar|pressure|air resistance|fluid dynamics|spoilers?|"
    r"wings?|airplanes?|aircraft|cars?|vehicles?|velocity|wake|cfd"
    r")\b",
    flags=re.IGNORECASE,
)
DEFAULT_GEMINI_TEXT_MODEL = "gemini-2.5-flash-lite"
DEFAULT_GEMINI_FALLBACK_TEXT_MODELS = (
    "gemini-2.5-flash",
)
GEMINI_TEACHER_SPEECH_CHAR_LIMIT = 900
GEMINI_IMAGE_CONTEXT_CHAR_LIMIT = 220
GEMINI_MAX_OUTPUT_TOKENS = 220
GEMINI_REQUEST_TIMEOUT_SECONDS = 20
GEMINI_MAX_ATTEMPTS = 3
LOCAL_VISUAL_PROMPT_PREFIX = "Fast local visual selected for:"
TEXT_ONLY_IMAGE_PROMPT_PREFIX = "Text-only classroom note"
PUBLIC_DIR = Path(__file__).resolve().parents[2] / "public"
PUBLIC_IMAGE_EXTENSIONS = {".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"}

PUBLIC_IMAGE_LABELS = {
    "aerodynamics.png": "aerodynamics airflow visualization",
    "beaker.png": "empty labeled beaker diagram",
    "beaker_200ml.png": "beaker filled to the 200 ml mark",
    "beaker_blue.png": "beaker filled with blue water",
    "beaker_bunsen.png": "blue water beaker over a Bunsen burner",
    "cell.png": "animal cell diagram",
    "neuralnet.png": "neural network layer diagram",
}

PUBLIC_IMAGE_ALIASES = {
    "aerodynamics.png": (
        "aerodynamic",
        "aerodynamics",
        "air flow",
        "airflow",
        "air resistance",
        "car aerodynamics",
        "downforce",
        "drag",
        "fluid dynamics",
        "lift",
        "streamline",
        "streamlines",
        "wind tunnel",
    ),
    "beaker.png": (
        "beaker",
        "empty beaker",
        "labeled beaker",
    ),
    "beaker_200ml.png": (
        "200 ml",
        "200 milliliter",
        "200 milliliters",
        "200ml",
        "beaker 200 ml",
        "beaker 200ml",
        "two hundred ml",
        "two hundred milliliters",
    ),
    "beaker_blue.png": (
        "beaker blue",
        "beaker with blue water",
        "blue beaker",
        "blue water",
        "blue water beaker",
    ),
    "beaker_bunsen.png": (
        "beaker bunsen",
        "beaker over bunsen burner",
        "bunsen",
        "bunsen burner",
        "bunsen burners",
        "heated beaker",
    ),
    "cell.png": (
        "animal cell",
        "cell",
        "cell diagram",
        "cells",
    ),
    "neuralnet.png": (
        "ai",
        "artificial intelligence",
        "deep learning",
        "machine learning",
        "neural net",
        "neural network",
        "neural networks",
        "neuralnet",
        "neurons",
    ),
}


@dataclass
class PipelineResult:
    text: str
    imageUrl: str
    imagePrompt: str
    mode: str
    textMode: str


@dataclass(frozen=True)
class LocalPublicImage:
    filename: str
    label: str
    aliases: tuple[str, ...]

    @property
    def image_url(self) -> str:
        return f"/{self.filename}"

    @property
    def image_prompt(self) -> str:
        return f"{LOCAL_VISUAL_PROMPT_PREFIX} {self.label}"


def _words(value: str) -> tuple[str, ...]:
    return tuple(re.findall(r"[a-z0-9]+", value.lower()))


def _label_from_stem(stem: str) -> str:
    words = _words(stem)
    return " ".join(words) if words else stem


def _aliases_from_stem(stem: str, include_word_aliases: bool) -> set[str]:
    words = _words(stem)
    if not words:
        return {stem}

    aliases = {" ".join(words), "".join(words)}

    if include_word_aliases:
        aliases.update(
            word for word in words if len(word) >= 4 or any(char.isdigit() for char in word)
        )

    return aliases


def _word_matches(actual: str, expected: str) -> bool:
    return actual == expected or (
        len(expected) > 2 and not expected.endswith("s") and actual == f"{expected}s"
    )


def _alias_match_score(speech_words: tuple[str, ...], alias: str) -> int:
    alias_words = _words(alias)
    if not alias_words or len(alias_words) > len(speech_words):
        return 0

    for start in range(len(speech_words) - len(alias_words) + 1):
        if all(
            _word_matches(speech_words[start + offset], alias_word)
            for offset, alias_word in enumerate(alias_words)
        ):
            return len(alias_words) * 100 + sum(len(word) for word in alias_words)

    return 0


class LocalPublicImageIndex:
    """Matches teacher words to image files present in the Next public folder."""

    def __init__(self, public_dir: Path = PUBLIC_DIR) -> None:
        self.images = self._load_images(public_dir)

    def match(self, teacher_speech: str) -> LocalPublicImage | None:
        speech_words = _words(teacher_speech)
        best_match: tuple[int, int, LocalPublicImage] | None = None

        for index, image in enumerate(self.images):
            score = max(
                (_alias_match_score(speech_words, alias) for alias in image.aliases),
                default=0,
            )
            if score == 0:
                continue

            match = (score, -index, image)
            if best_match is None or match > best_match:
                best_match = match

        return best_match[2] if best_match else None

    def _load_images(self, public_dir: Path) -> tuple[LocalPublicImage, ...]:
        if not public_dir.exists():
            return ()

        images: list[LocalPublicImage] = []

        for path in sorted(public_dir.iterdir(), key=lambda item: item.name.lower()):
            if not path.is_file() or path.suffix.lower() not in PUBLIC_IMAGE_EXTENSIONS:
                continue

            filename = path.name
            known_aliases = PUBLIC_IMAGE_ALIASES.get(filename, ())
            aliases = set(known_aliases)
            aliases.update(
                _aliases_from_stem(
                    path.stem,
                    include_word_aliases=filename not in PUBLIC_IMAGE_ALIASES,
                )
            )

            images.append(
                LocalPublicImage(
                    filename=filename,
                    label=PUBLIC_IMAGE_LABELS.get(filename, _label_from_stem(path.stem)),
                    aliases=tuple(sorted(alias for alias in aliases if alias)),
                )
            )

        return tuple(images)


class GeminiGenerationError(RuntimeError):
    def __init__(self, message: str, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


class SmallTextModel:
    """Generates concise note bullets, using Gemini text only when configured."""

    def __init__(self) -> None:
        self.api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self.model_names = self._get_model_names()

    def generate(self, teacher_speech: str, image_prompt: str) -> tuple[str, str]:
        text_only = image_prompt.startswith(TEXT_ONLY_IMAGE_PROMPT_PREFIX)

        if text_only and not self.api_key:
            raise RuntimeError("GEMINI_API_KEY is required for typed Gemini notes.")

        if image_prompt in {
            NEURAL_NETWORK_IMAGE_PROMPT,
            NEURAL_INPUT_LAYER_IMAGE_PROMPT,
        }:
            return self._generate_neural_network_summary(image_prompt), "local"

        if image_prompt == CELL_IMAGE_PROMPT:
            return self._generate_cell_summary(), "local"

        if image_prompt == AERODYNAMICS_IMAGE_PROMPT:
            return self._generate_aerodynamics_summary(), "local"

        if image_prompt.startswith(LOCAL_VISUAL_PROMPT_PREFIX):
            return self._generate_local(teacher_speech, image_prompt), "local"

        if self.api_key:
            try:
                return self._generate_with_gemini(teacher_speech, image_prompt), "gemini"
            except RuntimeError:
                if text_only:
                    raise

                # Keep local visual prompts usable if Gemini is temporarily down.
                return self._generate_local(teacher_speech, image_prompt), "local-fallback"

        if text_only:
            raise RuntimeError("GEMINI_API_KEY is required for typed Gemini notes.")

        return self._generate_local(teacher_speech, image_prompt), "local"

    def _generate_cell_summary(self) -> str:
        return (
            "- Cell membrane: the flexible outer boundary controls what enters and leaves the animal cell.\n"
            "- Cytoplasm: the jelly-like interior holds the organelles in place so reactions can happen throughout the cell.\n"
            "- Nucleus: the control center stores DNA and sends instructions for growth, repair, and cell activity.\n"
            "- Mitochondria, ribosomes, ER, and Golgi: these structures release energy, build proteins, move materials, and package products for use or transport."
        )

    def _generate_aerodynamics_summary(self) -> str:
        return (
            "- Streamlines show airflow staying attached over smooth surfaces and bending around the vehicle body.\n"
            "- Drag increases where air separates, forms a wake behind the object, or hits blunt surfaces head-on.\n"
            "- Pressure differences above and below shaped surfaces can create lift on wings or downforce on cars.\n"
            "- Engineers adjust spoilers, body shape, vents, and underbody flow to improve stability, cooling, efficiency, and speed."
        )

    def _generate_neural_network_summary(self, image_prompt: str) -> str:
        if image_prompt == NEURAL_INPUT_LAYER_IMAGE_PROMPT:
            return (
                "- Input layer neurons receive the first values from the example data.\n"
                "- Each connection passes a weighted signal into the next layer.\n"
                "- Activation functions help decide which signals continue through the network."
            )

        return (
            "- Neural networks learn patterns by passing signals through connected layers.\n"
            "- Weights and biases change during training to reduce prediction errors.\n"
            "- Hidden layers combine simple features into more useful representations."
        )

    def _generate_local(self, teacher_speech: str, image_prompt: str) -> str:
        # Keep this instant: the demo should feel close to real-time.
        first_sentence = teacher_speech.split(".")[0].strip()
        topic = first_sentence[:140] if first_sentence else teacher_speech[:140]
        visual_focus = re.sub(
            r"^(Existing demo image|Fast local visual) selected for:\s*",
            "",
            image_prompt,
        ).strip()

        return (
            f"The image shows a visual example of {visual_focus}.\n"
            f"The main idea is connected to {topic.lower()}.\n"
            "The details in the picture help make the lesson easier to picture."
        )

    def _generate_with_gemini(self, teacher_speech: str, image_prompt: str) -> str:
        compact_speech = re.sub(r"\s+", " ", teacher_speech).strip()
        compact_image_prompt = re.sub(r"\s+", " ", image_prompt).strip()
        prompt = (
            "Write exactly 4 descriptive classroom note bullets. "
            "Each bullet <= 18 words. Include concrete details, but no title or intro. "
            f"Visual: {compact_image_prompt[:GEMINI_IMAGE_CONTEXT_CHAR_LIMIT]}. "
            f"Lesson: {compact_speech[:GEMINI_TEACHER_SPEECH_CHAR_LIMIT]}"
        )
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "candidateCount": 1,
                "maxOutputTokens": GEMINI_MAX_OUTPUT_TOKENS,
                "temperature": 0.2,
            },
        }
        errors: list[str] = []

        for model_name in self.model_names:
            request = self._create_gemini_request(model_name, payload)

            try:
                data = self._request_gemini(request, model_name)
                break
            except GeminiGenerationError as error:
                errors.append(str(error))

                if not error.retryable:
                    raise RuntimeError(str(error)) from error
        else:
            raise RuntimeError("Gemini text generation failed: " + " | ".join(errors))

        parts = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [])
        )
        text = "\n".join(part.get("text", "") for part in parts).strip()

        if not text:
            raise RuntimeError("Gemini returned no text.")

        return text

    def _get_model_names(self) -> tuple[str, ...]:
        primary_model = os.getenv("GEMINI_TEXT_MODEL", DEFAULT_GEMINI_TEXT_MODEL)
        fallback_models = os.getenv("GEMINI_FALLBACK_TEXT_MODELS", "")
        configured_models = [
            model.strip()
            for model in fallback_models.split(",")
            if model.strip()
        ]

        model_names = [primary_model, *(configured_models or DEFAULT_GEMINI_FALLBACK_TEXT_MODELS)]
        return tuple(dict.fromkeys(model_names))

    def _create_gemini_request(
        self,
        model_name: str,
        payload: dict,
    ) -> urllib.request.Request:
        url = (
            "https://generativelanguage.googleapis.com/v1/models/"
            f"{model_name}:generateContent"
        )
        return urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": self.api_key or "",
            },
            method="POST",
        )

    def _request_gemini(
        self,
        request: urllib.request.Request,
        model_name: str,
    ) -> dict:
        last_error = "unknown error"

        for attempt in range(1, GEMINI_MAX_ATTEMPTS + 1):
            try:
                with urllib.request.urlopen(
                    request,
                    timeout=GEMINI_REQUEST_TIMEOUT_SECONDS,
                ) as response:
                    return json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as error:
                body = error.read().decode("utf-8", errors="replace")[:500]
                last_error = f"HTTP {error.code}: {body or error.reason}"

                if error.code not in {429, 500, 502, 503, 504}:
                    raise GeminiGenerationError(
                        f"Gemini model {model_name} failed: {last_error}",
                        retryable=False,
                    ) from error
            except (urllib.error.URLError, TimeoutError) as error:
                last_error = str(error)
            except json.JSONDecodeError as error:
                raise GeminiGenerationError(
                    f"Gemini model {model_name} returned invalid JSON.",
                    retryable=False,
                ) from error

            if attempt < GEMINI_MAX_ATTEMPTS:
                time.sleep(0.5 * attempt)

        raise GeminiGenerationError(
            f"Gemini model {model_name} failed after retries: {last_error}",
            retryable=True,
        )


class ExistingImageProvider:
    """Selects local visuals instead of generating or fetching images."""

    def __init__(self) -> None:
        self.public_image_index = LocalPublicImageIndex()

    def generate(
        self,
        teacher_speech: str,
        text_only: bool = False,
    ) -> tuple[str, str, str]:
        if NEURAL_INPUT_LAYER_TOPIC_PATTERN.search(teacher_speech):
            return (
                NEURAL_NETWORK_IMAGE_URL,
                NEURAL_INPUT_LAYER_IMAGE_PROMPT,
                "local-image",
            )

        if NEURAL_NETWORK_TOPIC_PATTERN.search(teacher_speech):
            return (
                NEURAL_NETWORK_IMAGE_URL,
                NEURAL_NETWORK_IMAGE_PROMPT,
                "local-image",
            )

        if CELL_TOPIC_PATTERN.search(teacher_speech):
            return CELL_IMAGE_URL, CELL_IMAGE_PROMPT, "local-image"

        if AERODYNAMICS_TOPIC_PATTERN.search(teacher_speech):
            return (
                AERODYNAMICS_IMAGE_URL,
                AERODYNAMICS_IMAGE_PROMPT,
                "local-image",
            )

        public_image = self.public_image_index.match(teacher_speech)
        if public_image:
            return public_image.image_url, public_image.image_prompt, "local-image"

        if text_only:
            compact_speech = re.sub(r"\s+", " ", teacher_speech).strip()
            return (
                "",
                f"{TEXT_ONLY_IMAGE_PROMPT_PREFIX}: {compact_speech[:160]}",
                "text-only",
            )

        query = self._select_query(teacher_speech)
        image_url = self._local_topic_visual(query)
        image_prompt = f"{LOCAL_VISUAL_PROMPT_PREFIX} {query}"

        return image_url, image_prompt, "local-image"

    def _select_query(self, teacher_speech: str) -> str:
        text = teacher_speech.lower()
        topic_map = {
            "photosynthesis": "plants and sunlight",
            "plant": "plants",
            "gravity": "physics motion",
            "earth": "earth science",
            "space": "space science",
            "cell": "biology cells",
            "math": "mathematics lesson",
        }

        for keyword, query in topic_map.items():
            if keyword in text:
                return query

        return "classroom learning"

    def _local_topic_visual(self, query: str) -> str:
        title = query.title()
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">
  <rect width="960" height="540" fill="#f8fafc"/>
  <circle cx="250" cy="230" r="120" fill="#7dd3fc" opacity=".75"/>
  <circle cx="570" cy="290" r="155" fill="#86efac" opacity=".7"/>
  <path d="M140 390 C300 300 430 425 610 330 S820 250 880 345" fill="none" stroke="#0f766e" stroke-width="18" stroke-linecap="round"/>
  <text x="80" y="105" fill="#0f172a" font-family="Arial, sans-serif" font-size="54" font-weight="700">{title}</text>
  <text x="84" y="165" fill="#334155" font-family="Arial, sans-serif" font-size="30">Classroom visual</text>
</svg>"""
        return f"data:image/svg+xml,{urllib.parse.quote(svg)}"


class ImaginePipeline:
    """Coordinates one teacher input chunk into one live demo output."""

    def __init__(self) -> None:
        self.text_model = SmallTextModel()
        self.image_provider = ExistingImageProvider()

    async def generate(
        self,
        teacher_speech: str,
        text_only: bool = False,
    ) -> dict[str, str]:
        # One input chunk returns one combined note and visual frame.
        image_url, image_prompt, mode = self.image_provider.generate(
            teacher_speech,
            text_only=text_only,
        )
        text, text_mode = self.text_model.generate(teacher_speech, image_prompt)

        result = PipelineResult(
            text=text,
            imageUrl=image_url,
            imagePrompt=image_prompt,
            mode=mode,
            textMode=text_mode,
        )
        return result.__dict__
