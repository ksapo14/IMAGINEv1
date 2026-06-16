import json
import os
import re
import urllib.error
import urllib.request
import urllib.parse
from dataclasses import dataclass

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


@dataclass
class PipelineResult:
    text: str
    imageUrl: str
    imagePrompt: str
    mode: str
    textMode: str


class SmallTextModel:
    """Generates visual description bullets, using Gemini when configured."""

    def __init__(self) -> None:
        self.api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self.model_name = os.getenv("GEMINI_TEXT_MODEL", "gemini-3.1-flash-lite")

    def generate(self, teacher_speech: str, image_prompt: str) -> tuple[str, str]:
        if image_prompt in {
            NEURAL_NETWORK_IMAGE_PROMPT,
            NEURAL_INPUT_LAYER_IMAGE_PROMPT,
        }:
            return "", "local"

        if image_prompt == CELL_IMAGE_PROMPT:
            return self._generate_cell_summary(), "local"

        if image_prompt == AERODYNAMICS_IMAGE_PROMPT:
            return self._generate_aerodynamics_summary(), "local"

        if self.api_key:
            try:
                return self._generate_with_gemini(teacher_speech, image_prompt), "gemini"
            except RuntimeError:
                # Keep the live demo running if the free tier is exhausted.
                return self._generate_local(teacher_speech, image_prompt), "local-fallback"

        return self._generate_local(teacher_speech, image_prompt), "local"

    def _generate_cell_summary(self) -> str:
        return (
            "A cell is the basic living unit that makes up plants, animals, and other organisms.\n"
            "The image shows an animal cell, with a plasma membrane holding cytoplasm and organelles inside.\n"
            "The nucleus stores DNA and helps control cell activities, while mitochondria release energy for the cell to use.\n"
            "Other parts, like ribosomes, the Golgi complex, and endoplasmic reticulum, help build, package, and move materials."
        )

    def _generate_aerodynamics_summary(self) -> str:
        return (
            "Aerodynamics is the study of how air moves around objects such as cars, wings, aircraft, and rockets.\n"
            "The image shows colored airflow streamlines wrapping over a car, revealing where air speeds up, slows down, and separates.\n"
            "Smooth airflow can reduce drag, while pressure differences and shaped surfaces can create lift or downforce.\n"
            "Engineers use visuals like this to improve stability, efficiency, cooling, and speed."
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
        prompt = (
            "Write exactly three short bullet-style lines that describe the image "
            "as if it is being shown next to a lesson. Do not use section labels "
            "like Student note, Prompt, Key idea, caption, or description. "
            "Use natural visual language: 'The image shows...', "
            "'You can see...', or 'This visual highlights...'. "
            f"Image context: {image_prompt[:300]}. "
            f"Teacher speech: {teacher_speech[:1200]}"
        )
        url = (
            "https://generativelanguage.googleapis.com/v1/models/"
            f"{self.model_name}:generateContent"
        )
        payload = {"contents": [{"parts": [{"text": prompt}]}]}
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": self.api_key or "",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                data = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            raise RuntimeError("Gemini text generation failed.") from error

        parts = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [])
        )
        text = "\n".join(part.get("text", "") for part in parts).strip()

        if not text:
            raise RuntimeError("Gemini returned no text.")

        return text


class ExistingImageProvider:
    """Selects an existing hosted image instead of generating a new one."""

    def generate(self, teacher_speech: str) -> tuple[str, str, str]:
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

        query = self._select_query(teacher_speech)
        image_url = self._local_topic_visual(query)
        image_prompt = f"Fast local visual selected for: {query}"

        return image_url, image_prompt, "local-image"

    def _select_query(self, teacher_speech: str) -> str:
        text = teacher_speech.lower()
        topic_map = {
            "photosynthesis": "plants and sunlight",
            "plant": "plants",
            "water": "water cycle",
            "gravity": "physics motion",
            "earth": "earth science",
            "space": "space science",
            "cell": "biology cells",
            "history": "history classroom",
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

    async def generate(self, teacher_speech: str) -> dict[str, str]:
        # One input chunk returns one combined note and visual frame.
        image_url, image_prompt, mode = self.image_provider.generate(teacher_speech)
        text, text_mode = self.text_model.generate(teacher_speech, image_prompt)

        result = PipelineResult(
            text=text,
            imageUrl=image_url,
            imagePrompt=image_prompt,
            mode=mode,
            textMode=text_mode,
        )
        return result.__dict__
