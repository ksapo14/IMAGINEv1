import base64
import json
import unittest
import urllib.request
from typing import Any

from backend.services.gemini_pipeline import (
    GeminiConfigurationError,
    GeminiPipeline,
)
from backend.services.web_image_search import (
    SearchCandidate,
    WebImageError,
)


def text_response(
    *,
    strategy: str = "none",
    search_query: str = "",
    visual_prompt: str = "",
    visual_alt: str = "",
) -> dict[str, Any]:
    structured = {
        "title": "How cells make energy",
        "bullets": [
            "Mitochondria convert stored chemical energy into ATP.",
            "ATP supplies usable energy for cellular work.",
        ],
        "visualStrategy": strategy,
        "searchQuery": search_query,
        "visualPrompt": visual_prompt,
        "visualAlt": visual_alt,
    }
    return {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": json.dumps(structured)}],
                }
            }
        ]
    }


def search_response() -> dict[str, Any]:
    candidate = {
        "sourcePageUrl": (
            "https://commons.wikimedia.org/wiki/File:Mitochondrion_structure.svg"
        ),
        "imageUrl": "",
        "sourceLabel": "Mitochondrion structure",
        "license": "CC BY-SA 4.0",
    }
    return {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": json.dumps(candidate)}],
                },
                "groundingMetadata": {
                    "groundingChunks": [
                        {
                            "web": {
                                "uri": "https://example.com/grounded-redirect",
                                "title": "Wikimedia Commons",
                            }
                        }
                    ]
                },
            }
        ]
    }


def image_response() -> dict[str, Any]:
    encoded = base64.b64encode(b"test-image").decode("ascii")
    return {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "inlineData": {
                                "mimeType": "image/png",
                                "data": encoded,
                            }
                        }
                    ]
                }
            }
        ]
    }


class StubTransport:
    def __init__(self, responses: list[dict[str, Any]]) -> None:
        self.responses = responses
        self.requests: list[tuple[urllib.request.Request, float]] = []

    def __call__(
        self,
        request: urllib.request.Request,
        timeout_seconds: float,
    ) -> dict[str, Any]:
        self.requests.append((request, timeout_seconds))
        return self.responses.pop(0)


class StubWebImageResolver:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.calls: list[tuple[SearchCandidate, str]] = []

    def resolve(
        self,
        candidate: SearchCandidate,
        alt_text: str,
    ) -> dict[str, Any]:
        self.calls.append((candidate, alt_text))
        if self.fail:
            raise WebImageError("No safe image.")
        return {
            "kind": "searched",
            "dataUrl": "data:image/png;base64,dGVzdA==",
            "mimeType": "image/png",
            "alt": alt_text,
            "source": {
                "label": candidate.source_label,
                "url": candidate.source_page_url,
                "license": candidate.license_label,
            },
        }


class GeminiPipelineTests(unittest.IsolatedAsyncioTestCase):
    async def test_text_only_uses_one_lite_request(self) -> None:
        transport = StubTransport([text_response()])
        pipeline = GeminiPipeline(
            api_key="server-secret",
            text_model="gemini-2.5-flash-lite",
            search_model="gemini-2.5-flash",
            image_model="gemini-2.5-flash-image",
            transport=transport,
            web_image_resolver=StubWebImageResolver(),
        )

        result = await pipeline.generate("Explain ATP.")

        self.assertEqual(len(transport.requests), 1)
        request, _ = transport.requests[0]
        self.assertIn("gemini-2.5-flash-lite", request.full_url)
        self.assertNotIn("server-secret", request.full_url)
        self.assertEqual(
            dict(request.header_items())["X-goog-api-key"],
            "server-secret",
        )
        request_body = json.loads(request.data.decode("utf-8"))
        self.assertEqual(
            request_body["generationConfig"]["maxOutputTokens"],
            256,
        )
        self.assertIsNone(result["visual"])

    async def test_generate_strategy_uses_one_image_request(self) -> None:
        transport = StubTransport(
            [
                text_response(
                    strategy="generate",
                    visual_prompt="A clean diagram of ATP production.",
                    visual_alt="Diagram showing ATP production.",
                ),
                image_response(),
            ]
        )
        pipeline = GeminiPipeline(
            api_key="server-secret",
            transport=transport,
            web_image_resolver=StubWebImageResolver(),
        )

        result = await pipeline.generate("Draw how a cell makes ATP.")

        self.assertEqual(len(transport.requests), 2)
        image_request, _ = transport.requests[1]
        self.assertIn("gemini-2.5-flash-image", image_request.full_url)
        self.assertEqual(result["visual"]["kind"], "generated")
        self.assertIsNone(result["visual"]["source"])

    async def test_search_strategy_returns_grounded_web_image(self) -> None:
        transport = StubTransport(
            [
                text_response(
                    strategy="search",
                    search_query="mitochondrion microscope image",
                    visual_prompt="A clear mitochondrion illustration.",
                    visual_alt="A mitochondrion.",
                ),
                search_response(),
            ]
        )
        resolver = StubWebImageResolver()
        pipeline = GeminiPipeline(
            api_key="server-secret",
            transport=transport,
            web_image_resolver=resolver,
        )

        result = await pipeline.generate("Show a real mitochondrion image.")

        self.assertEqual(len(transport.requests), 2)
        search_request, _ = transport.requests[1]
        self.assertIn("gemini-2.5-flash:", search_request.full_url)
        search_body = json.loads(search_request.data.decode("utf-8"))
        self.assertEqual(search_body["tools"], [{"googleSearch": {}}])
        self.assertEqual(result["visual"]["kind"], "searched")
        self.assertEqual(len(resolver.calls), 1)

    async def test_repeated_search_query_uses_cached_candidate(self) -> None:
        note = text_response(
            strategy="search",
            search_query="mitochondrion microscope image",
            visual_prompt="A clear mitochondrion illustration.",
            visual_alt="A mitochondrion.",
        )
        transport = StubTransport([note, search_response(), note])
        resolver = StubWebImageResolver()
        pipeline = GeminiPipeline(
            api_key="server-secret",
            transport=transport,
            web_image_resolver=resolver,
        )

        await pipeline.generate("Show a mitochondrion.")
        await pipeline.generate("Show a mitochondrion again.")

        search_requests = [
            request
            for request, _ in transport.requests
            if "gemini-2.5-flash:" in request.full_url
        ]
        self.assertEqual(len(search_requests), 1)
        self.assertEqual(len(resolver.calls), 2)

    async def test_failed_search_falls_back_to_one_generated_image(self) -> None:
        transport = StubTransport(
            [
                text_response(
                    strategy="search",
                    search_query="mitochondrion microscope image",
                    visual_prompt="A clear mitochondrion illustration.",
                    visual_alt="A mitochondrion.",
                ),
                search_response(),
                image_response(),
            ]
        )
        pipeline = GeminiPipeline(
            api_key="server-secret",
            transport=transport,
            web_image_resolver=StubWebImageResolver(fail=True),
        )

        result = await pipeline.generate("Show a real mitochondrion image.")

        self.assertEqual(len(transport.requests), 3)
        self.assertEqual(result["visual"]["kind"], "generated")
        self.assertIsNone(result["warning"])

    async def test_ungrounded_search_result_falls_back_to_generation(self) -> None:
        ungrounded = search_response()
        ungrounded["candidates"][0]["groundingMetadata"]["groundingChunks"] = []
        transport = StubTransport(
            [
                text_response(
                    strategy="search",
                    search_query="mitochondrion microscope image",
                    visual_prompt="A clear mitochondrion illustration.",
                    visual_alt="A mitochondrion.",
                ),
                ungrounded,
                image_response(),
            ]
        )
        resolver = StubWebImageResolver()
        pipeline = GeminiPipeline(
            api_key="server-secret",
            transport=transport,
            web_image_resolver=resolver,
        )

        result = await pipeline.generate("Show a real mitochondrion image.")

        self.assertEqual(result["visual"]["kind"], "generated")
        self.assertEqual(resolver.calls, [])

    async def test_image_failure_returns_notes_without_retry(self) -> None:
        transport = StubTransport(
            [
                text_response(
                    strategy="generate",
                    visual_prompt="A diagram of ATP production.",
                    visual_alt="ATP production diagram.",
                ),
                {
                    "candidates": [
                        {"content": {"parts": [{"text": "No image available"}]}}
                    ]
                },
            ]
        )
        pipeline = GeminiPipeline(
            api_key="server-secret",
            transport=transport,
            web_image_resolver=StubWebImageResolver(),
        )

        result = await pipeline.generate("Draw ATP production.")

        self.assertEqual(len(transport.requests), 2)
        self.assertIsNone(result["visual"])
        self.assertIsNotNone(result["warning"])

    async def test_missing_key_fails_before_any_request(self) -> None:
        transport = StubTransport([])
        pipeline = GeminiPipeline(
            api_key="",
            transport=transport,
            web_image_resolver=StubWebImageResolver(),
        )

        with self.assertRaises(GeminiConfigurationError):
            await pipeline.generate("Explain ATP.")

        self.assertEqual(transport.requests, [])

    async def test_malformed_notes_do_not_trigger_visual_calls(self) -> None:
        transport = StubTransport(
            [
                {
                    "candidates": [
                        {"content": {"parts": [{"text": "not-json"}]}}
                    ]
                }
            ]
        )
        pipeline = GeminiPipeline(
            api_key="server-secret",
            transport=transport,
            web_image_resolver=StubWebImageResolver(),
        )

        with self.assertRaisesRegex(RuntimeError, "malformed notes"):
            await pipeline.generate("Explain ATP.")

        self.assertEqual(len(transport.requests), 1)


if __name__ == "__main__":
    unittest.main()
