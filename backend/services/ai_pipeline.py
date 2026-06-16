import hashlib
import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass


@dataclass
class PipelineResult:
    text: str
    imageUrl: str
    imagePrompt: str
    mode: str
    textMode: str


class SmallTextModel:
    """Generates the classroom note, using Gemini when configured."""

    def __init__(self) -> None:
        self.api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self.model_name = os.getenv("GEMINI_TEXT_MODEL", "gemini-3.1-flash-lite")

    def generate(self, teacher_speech: str) -> tuple[str, str]:
        if self.api_key:
            try:
                return self._generate_with_gemini(teacher_speech), "gemini"
            except RuntimeError:
                # Keep the live demo running if the free tier is exhausted.
                return self._generate_local(teacher_speech), "local-fallback"

        return self._generate_local(teacher_speech), "local"

    def _generate_local(self, teacher_speech: str) -> str:
        # Keep this instant: the demo should feel close to real-time.
        first_sentence = teacher_speech.split(".")[0].strip()
        topic = first_sentence[:140] if first_sentence else teacher_speech[:140]

        return (
            f"Key idea: {topic}\n"
            "Student note: Connect the visual to the spoken explanation.\n"
            "Prompt: What detail in the image helps explain the lesson?"
        )

    def _generate_with_gemini(self, teacher_speech: str) -> str:
        prompt = (
            "Create a concise classroom note from this teacher speech. "
            "Use exactly three short lines with these labels: "
            "Key idea, Student note, Prompt. "
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
        query = self._select_query(teacher_speech)
        seed = self._stable_seed(teacher_speech)

        # Lorem Picsum serves existing public photos by deterministic seed.
        # This keeps the live demo free and fast while the backend still owns
        # the visual-selection step.
        image_url = f"https://picsum.photos/seed/{seed}/960/540"
        image_prompt = f"Existing demo image selected for: {query}"

        return image_url, image_prompt, "existing-image"

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

    def _stable_seed(self, teacher_speech: str) -> str:
        normalized = re.sub(r"[^a-z0-9]+", "-", teacher_speech.lower()).strip("-")
        digest = hashlib.sha1(teacher_speech.encode("utf-8")).hexdigest()[:8]
        short_topic = normalized[:36] or "lesson"
        return f"imagine-{short_topic}-{digest}"


class ImaginePipeline:
    """Coordinates one teacher input chunk into one live demo output."""

    def __init__(self) -> None:
        self.text_model = SmallTextModel()
        self.image_provider = ExistingImageProvider()

    async def generate(self, teacher_speech: str) -> dict[str, str]:
        # One input chunk returns one combined note and visual frame.
        text, text_mode = self.text_model.generate(teacher_speech)
        image_url, image_prompt, mode = self.image_provider.generate(teacher_speech)

        result = PipelineResult(
            text=text,
            imageUrl=image_url,
            imagePrompt=image_prompt,
            mode=mode,
            textMode=text_mode,
        )
        return result.__dict__
