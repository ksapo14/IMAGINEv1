import base64
import html
import ipaddress
import json
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any


COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php"
DEFAULT_ALLOWED_HOSTS = (
    "commons.wikimedia.org",
    "upload.wikimedia.org",
)
SUPPORTED_IMAGE_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}
MAX_WEB_IMAGE_BYTES = 10 * 1024 * 1024
WEB_REQUEST_TIMEOUT_SECONDS = 20.0

JsonTransport = Callable[[urllib.request.Request, float], dict[str, Any]]
BinaryTransport = Callable[
    [urllib.request.Request, float, int],
    tuple[bytes, str],
]
DnsResolver = Callable[[str], list[str]]


class WebImageError(RuntimeError):
    """Raised when a searched image is unsafe or unusable."""


@dataclass(frozen=True)
class SearchCandidate:
    source_page_url: str
    image_url: str = ""
    source_label: str = ""
    license_label: str = ""


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self,
        request: urllib.request.Request,
        file_pointer: Any,
        code: int,
        message: str,
        headers: Any,
        new_url: str,
    ) -> None:
        return None


def _default_json_transport(
    request: urllib.request.Request,
    timeout_seconds: float,
) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            payload = response.read()
    except (TimeoutError, urllib.error.URLError) as error:
        raise WebImageError("The reusable image source was unavailable.") from error

    try:
        parsed = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise WebImageError(
            "The reusable image source returned invalid metadata."
        ) from error

    if not isinstance(parsed, dict):
        raise WebImageError(
            "The reusable image source returned invalid metadata."
        )
    return parsed


def _default_binary_transport(
    request: urllib.request.Request,
    timeout_seconds: float,
    maximum_bytes: int,
) -> tuple[bytes, str]:
    opener = urllib.request.build_opener(_NoRedirectHandler())
    try:
        with opener.open(request, timeout=timeout_seconds) as response:
            content_length = response.headers.get("Content-Length")
            if content_length and int(content_length) > maximum_bytes:
                raise WebImageError("The reusable image was too large.")

            mime_type = response.headers.get_content_type().lower()
            payload = response.read(maximum_bytes + 1)
    except WebImageError:
        raise
    except (TimeoutError, ValueError, urllib.error.URLError) as error:
        raise WebImageError("The reusable image could not be downloaded.") from error

    if len(payload) > maximum_bytes:
        raise WebImageError("The reusable image was too large.")
    return payload, mime_type


def _default_dns_resolver(hostname: str) -> list[str]:
    try:
        records = socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise WebImageError("The reusable image host could not be resolved.") from error
    return sorted({record[4][0] for record in records})


def _plain_text(value: Any, maximum_characters: int = 240) -> str:
    if not isinstance(value, str):
        return ""
    without_tags = re.sub(r"<[^>]+>", " ", html.unescape(value))
    return " ".join(without_tags.split())[:maximum_characters].strip()


def _metadata_value(metadata: dict[str, Any], key: str) -> str:
    entry = metadata.get(key)
    if not isinstance(entry, dict):
        return ""
    return _plain_text(entry.get("value"))


class WebImageResolver:
    def __init__(
        self,
        *,
        allowed_hosts: tuple[str, ...] = DEFAULT_ALLOWED_HOSTS,
        json_transport: JsonTransport | None = None,
        binary_transport: BinaryTransport | None = None,
        dns_resolver: DnsResolver | None = None,
    ) -> None:
        self.allowed_hosts = tuple(
            host.strip().lower().rstrip(".")
            for host in allowed_hosts
            if host.strip()
        )
        self.json_transport = json_transport or _default_json_transport
        self.binary_transport = binary_transport or _default_binary_transport
        self.dns_resolver = dns_resolver or _default_dns_resolver

    def resolve(
        self,
        candidate: SearchCandidate,
        alt_text: str,
    ) -> dict[str, Any]:
        source_page_url = self._validate_url(candidate.source_page_url)
        source_host = urllib.parse.urlparse(source_page_url).hostname or ""

        if source_host == "commons.wikimedia.org":
            resolved = self._resolve_commons_page(source_page_url)
        else:
            if not candidate.image_url:
                raise WebImageError(
                    "The reusable image result had no direct image URL."
                )
            resolved = {
                "imageUrl": candidate.image_url,
                "sourcePageUrl": source_page_url,
                "sourceLabel": candidate.source_label or source_host,
                "license": candidate.license_label or "Public domain",
            }

        image_url = self._validate_url(str(resolved["imageUrl"]))
        request = urllib.request.Request(
            image_url,
            headers={
                "Accept": "image/png,image/jpeg,image/webp",
                "User-Agent": "IMAGINEv1/1.0",
            },
            method="GET",
        )
        payload, mime_type = self.binary_transport(
            request,
            WEB_REQUEST_TIMEOUT_SECONDS,
            MAX_WEB_IMAGE_BYTES,
        )
        if len(payload) > MAX_WEB_IMAGE_BYTES:
            raise WebImageError("The reusable image was too large.")
        if mime_type not in SUPPORTED_IMAGE_MIME_TYPES or not payload:
            raise WebImageError(
                "The reusable image source returned an unsupported file."
            )

        encoded = base64.b64encode(payload).decode("ascii")
        return {
            "kind": "searched",
            "dataUrl": f"data:{mime_type};base64,{encoded}",
            "mimeType": mime_type,
            "alt": alt_text,
            "source": {
                "label": _plain_text(resolved.get("sourceLabel"))
                or source_host,
                "url": str(resolved["sourcePageUrl"]),
                "license": _plain_text(resolved.get("license"))
                or "See source for license",
            },
        }

    def _resolve_commons_page(self, source_page_url: str) -> dict[str, str]:
        parsed = urllib.parse.urlparse(source_page_url)
        title = urllib.parse.unquote(parsed.path.removeprefix("/wiki/"))
        if not title.lower().startswith("file:"):
            raise WebImageError(
                "The Wikimedia result was not an image source page."
            )

        query = urllib.parse.urlencode(
            {
                "action": "query",
                "format": "json",
                "formatversion": "2",
                "prop": "imageinfo",
                "iiprop": "url|mime|extmetadata",
                "titles": title,
            }
        )
        request = urllib.request.Request(
            f"{COMMONS_API_URL}?{query}",
            headers={"User-Agent": "IMAGINEv1/1.0"},
            method="GET",
        )
        response = self.json_transport(request, WEB_REQUEST_TIMEOUT_SECONDS)

        query_payload = response.get("query")
        pages = query_payload.get("pages") if isinstance(query_payload, dict) else None
        page = pages[0] if isinstance(pages, list) and pages else None
        image_info_list = page.get("imageinfo") if isinstance(page, dict) else None
        image_info = (
            image_info_list[0]
            if isinstance(image_info_list, list) and image_info_list
            else None
        )
        if not isinstance(image_info, dict):
            raise WebImageError(
                "Wikimedia returned no reusable image metadata."
            )

        image_url = image_info.get("url")
        description_url = image_info.get("descriptionurl")
        metadata = image_info.get("extmetadata")
        if (
            not isinstance(image_url, str)
            or not isinstance(description_url, str)
            or not isinstance(metadata, dict)
        ):
            raise WebImageError(
                "Wikimedia returned incomplete image metadata."
            )

        source_label = (
            _metadata_value(metadata, "ObjectName")
            or _plain_text(page.get("title") if isinstance(page, dict) else "")
            or "Wikimedia Commons"
        )
        artist = _metadata_value(metadata, "Artist")
        if artist:
            source_label = f"{source_label} — {artist}"

        return {
            "imageUrl": image_url,
            "sourcePageUrl": description_url,
            "sourceLabel": source_label,
            "license": (
                _metadata_value(metadata, "LicenseShortName")
                or "See source for license"
            ),
        }

    def _validate_url(self, value: str) -> str:
        try:
            parsed = urllib.parse.urlparse(value)
            port = parsed.port
        except ValueError as error:
            raise WebImageError("The reusable image URL was invalid.") from error

        hostname = (parsed.hostname or "").lower().rstrip(".")
        if (
            parsed.scheme != "https"
            or not hostname
            or parsed.username
            or parsed.password
            or port not in {None, 443}
            or not self._host_is_allowed(hostname)
        ):
            raise WebImageError("The reusable image URL was not allowed.")

        addresses = self.dns_resolver(hostname)
        if not addresses:
            raise WebImageError("The reusable image host could not be resolved.")

        for address in addresses:
            try:
                parsed_address = ipaddress.ip_address(address)
            except ValueError as error:
                raise WebImageError(
                    "The reusable image host returned an invalid address."
                ) from error

            if not parsed_address.is_global:
                raise WebImageError(
                    "The reusable image host resolved to a private address."
                )

        return urllib.parse.urlunparse(parsed._replace(fragment=""))

    def _host_is_allowed(self, hostname: str) -> bool:
        return any(
            hostname == allowed or hostname.endswith(f".{allowed}")
            for allowed in self.allowed_hosts
        )
