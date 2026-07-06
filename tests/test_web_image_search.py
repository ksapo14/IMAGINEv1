import unittest
import urllib.request
from typing import Any

from backend.services.web_image_search import (
    MAX_WEB_IMAGE_BYTES,
    SearchCandidate,
    WebImageError,
    WebImageResolver,
)


def commons_metadata() -> dict[str, Any]:
    return {
        "query": {
            "pages": [
                {
                    "title": "File:Mitochondrion structure.svg",
                    "imageinfo": [
                        {
                            "url": (
                                "https://upload.wikimedia.org/example/"
                                "mitochondrion.png"
                            ),
                            "descriptionurl": (
                                "https://commons.wikimedia.org/wiki/"
                                "File:Mitochondrion_structure.svg"
                            ),
                            "extmetadata": {
                                "ObjectName": {
                                    "value": "Mitochondrion structure"
                                },
                                "Artist": {"value": "<b>Example author</b>"},
                                "LicenseShortName": {"value": "CC BY-SA 4.0"},
                            },
                        }
                    ],
                }
            ]
        }
    }


class WebImageResolverTests(unittest.TestCase):
    def test_resolves_commons_metadata_and_proxies_image_bytes(self) -> None:
        json_requests: list[urllib.request.Request] = []
        binary_requests: list[urllib.request.Request] = []

        def json_transport(
            request: urllib.request.Request,
            timeout: float,
        ) -> dict[str, Any]:
            json_requests.append(request)
            return commons_metadata()

        def binary_transport(
            request: urllib.request.Request,
            timeout: float,
            maximum_bytes: int,
        ) -> tuple[bytes, str]:
            binary_requests.append(request)
            return b"image-bytes", "image/png"

        resolver = WebImageResolver(
            json_transport=json_transport,
            binary_transport=binary_transport,
            dns_resolver=lambda hostname: ["8.8.8.8"],
        )

        result = resolver.resolve(
            SearchCandidate(
                source_page_url=(
                    "https://commons.wikimedia.org/wiki/"
                    "File:Mitochondrion_structure.svg"
                )
            ),
            "Mitochondrion structure.",
        )

        self.assertEqual(result["kind"], "searched")
        self.assertTrue(result["dataUrl"].startswith("data:image/png;base64,"))
        self.assertEqual(result["source"]["license"], "CC BY-SA 4.0")
        self.assertIn("Example author", result["source"]["label"])
        self.assertEqual(len(json_requests), 1)
        self.assertEqual(len(binary_requests), 1)

    def test_rejects_non_allowlisted_host_before_download(self) -> None:
        resolver = WebImageResolver(
            dns_resolver=lambda hostname: ["8.8.8.8"],
        )

        with self.assertRaisesRegex(WebImageError, "not allowed"):
            resolver.resolve(
                SearchCandidate(
                    source_page_url="https://attacker.example/image",
                    image_url="https://attacker.example/image.png",
                ),
                "Unsafe image.",
            )

    def test_rejects_private_dns_address_before_download(self) -> None:
        resolver = WebImageResolver(
            dns_resolver=lambda hostname: ["127.0.0.1"],
        )

        with self.assertRaisesRegex(WebImageError, "private address"):
            resolver.resolve(
                SearchCandidate(
                    source_page_url=(
                        "https://commons.wikimedia.org/wiki/File:Unsafe.png"
                    )
                ),
                "Unsafe image.",
            )

    def test_rejects_unsupported_download_mime_type(self) -> None:
        resolver = WebImageResolver(
            json_transport=lambda request, timeout: commons_metadata(),
            binary_transport=lambda request, timeout, maximum: (
                b"<html></html>",
                "text/html",
            ),
            dns_resolver=lambda hostname: ["8.8.8.8"],
        )

        with self.assertRaisesRegex(WebImageError, "unsupported file"):
            resolver.resolve(
                SearchCandidate(
                    source_page_url=(
                        "https://commons.wikimedia.org/wiki/"
                        "File:Mitochondrion_structure.svg"
                    )
                ),
                "Mitochondrion structure.",
            )

    def test_rejects_oversized_download(self) -> None:
        resolver = WebImageResolver(
            json_transport=lambda request, timeout: commons_metadata(),
            binary_transport=lambda request, timeout, maximum: (
                b"x" * (MAX_WEB_IMAGE_BYTES + 1),
                "image/png",
            ),
            dns_resolver=lambda hostname: ["8.8.8.8"],
        )

        with self.assertRaisesRegex(WebImageError, "too large"):
            resolver.resolve(
                SearchCandidate(
                    source_page_url=(
                        "https://commons.wikimedia.org/wiki/"
                        "File:Mitochondrion_structure.svg"
                    )
                ),
                "Mitochondrion structure.",
            )


if __name__ == "__main__":
    unittest.main()
