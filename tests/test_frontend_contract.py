import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def jpeg_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if not data.startswith(b"\xff\xd8"):
        raise AssertionError(f"{path} is not a JPEG")

    cursor = 2
    start_of_frame = {
        0xC0,
        0xC1,
        0xC2,
        0xC3,
        0xC5,
        0xC6,
        0xC7,
        0xC9,
        0xCA,
        0xCB,
        0xCD,
        0xCE,
        0xCF,
    }
    while cursor + 8 < len(data):
        if data[cursor] != 0xFF:
            cursor += 1
            continue
        marker = data[cursor + 1]
        cursor += 2
        if marker in {0xD8, 0xD9}:
            continue
        segment_length = int.from_bytes(data[cursor : cursor + 2], "big")
        if marker in start_of_frame:
            height = int.from_bytes(data[cursor + 3 : cursor + 5], "big")
            width = int.from_bytes(data[cursor + 5 : cursor + 7], "big")
            return width, height
        cursor += segment_length
    raise AssertionError(f"{path} has no JPEG start-of-frame marker")


class FrontendContractTests(unittest.TestCase):
    def marketing_source(self) -> str:
        files = [
            *sorted((ROOT / "app" / "(marketing)").rglob("*.tsx")),
            *sorted((ROOT / "components" / "marketing").rglob("*.tsx")),
            *sorted((ROOT / "components" / "marketing").rglob("*.ts")),
        ]
        return "\n".join(path.read_text(encoding="utf-8") for path in files)

    def test_canvas_route_exists(self) -> None:
        canvas_page = ROOT / "app" / "canvas" / "page.tsx"
        self.assertTrue(canvas_page.is_file())
        canvas_source = canvas_page.read_text(encoding="utf-8")
        self.assertIn("export default function CanvasPage", canvas_source)
        self.assertIn(
            'type DashboardTab = "prepare" | "library" | "live"',
            canvas_source,
        )
        self.assertIn('activeTab === "prepare"', canvas_source)
        self.assertIn('activeTab === "live"', canvas_source)
        self.assertNotIn('activeTab === "overview"', canvas_source)
        self.assertNotIn('activeTab === "teach"', canvas_source)

    def test_prepared_recall_is_local_and_explicit(self) -> None:
        recall_library = (
            ROOT / "lib" / "lesson-library.ts"
        ).read_text(encoding="utf-8")
        stream_client = (
            ROOT / "lib" / "generation-stream.ts"
        ).read_text(encoding="utf-8")

        self.assertIn("imagine[\\s,]+show\\s+me", recall_library)
        self.assertIn("LESSON_LIBRARY_KEY", recall_library)
        self.assertIn("/api/generate/stream", stream_client)
        self.assertIn('type GenerationMode = "live" | "prepare"', stream_client)
        self.assertIn("JSON.stringify({ userInput, mode })", stream_client)

    def test_live_canvas_unifies_speech_recall_and_generation(self) -> None:
        canvas_source = (ROOT / "app" / "canvas" / "page.tsx").read_text(
            encoding="utf-8"
        )
        live_session = (ROOT / "lib" / "live-session.ts").read_text(
            encoding="utf-8"
        )

        self.assertIn("dispatchFinalizedTranscript", canvas_source)
        self.assertIn("dispatchTeachingTurn", canvas_source)
        self.assertIn("ordinaryTurnQueue", canvas_source)
        self.assertIn("setPresentedBlock(block)", canvas_source)
        self.assertIn("generationInFlight.current", canvas_source)
        self.assertIn(r"^\s*imagine\b", live_session)

    def test_live_canvas_keeps_a_semantic_summary_sidebar(self) -> None:
        canvas_source = (ROOT / "app" / "canvas" / "page.tsx").read_text(
            encoding="utf-8"
        )

        self.assertIn("<aside", canvas_source)
        self.assertIn("data-live-summary", canvas_source)
        self.assertIn('aria-labelledby="live-summary-title"', canvas_source)
        self.assertIn('id="live-summary-title"', canvas_source)
        self.assertIn("deriveCompositionSummary", canvas_source)

    def test_transcription_callbacks_are_scoped_to_one_session(self) -> None:
        canvas_source = (ROOT / "app" / "canvas" / "page.tsx").read_text(
            encoding="utf-8"
        )

        self.assertIn("const transcriptionSessionId = useRef(0)", canvas_source)
        self.assertIn("transcriptionSessionId.current += 1", canvas_source)
        self.assertIn(
            "const ownsSession = () => transcriptionSessionId.current === sessionId",
            canvas_source,
        )
        self.assertGreaterEqual(canvas_source.count("if (!ownsSession())"), 8)
        self.assertIn("releaseSessionResources", canvas_source)
        self.assertNotIn("speechStopRequested", canvas_source)
        self.assertNotIn("deepgramConnected", canvas_source)

    def test_development_frontend_uses_advertised_port(self) -> None:
        package = json.loads((ROOT / "package.json").read_text())
        self.assertIn("scripts/dev.ps1", package["scripts"]["dev"])

        dev_script = (ROOT / "scripts" / "dev.ps1").read_text()
        self.assertIn("Frontend: http://localhost:3000", dev_script)
        self.assertIn("& $next dev -p 3000", dev_script)

    def test_public_routes_use_a_shared_marketing_layout(self) -> None:
        marketing = ROOT / "app" / "(marketing)"
        routes = {
            "/": marketing / "page.tsx",
            "/product": marketing / "product" / "page.tsx",
            "/educators": marketing / "educators" / "page.tsx",
            "/schools": marketing / "schools" / "page.tsx",
            "/about": marketing / "about" / "page.tsx",
        }

        self.assertTrue((marketing / "layout.tsx").is_file())
        for route, path in routes.items():
            with self.subTest(route=route):
                self.assertTrue(path.is_file())
        self.assertFalse((ROOT / "app" / "page.tsx").exists())

        layout_sources = [
            path.read_text(encoding="utf-8")
            for path in (ROOT / "app").rglob("layout.tsx")
        ]
        self.assertEqual(sum(source.count("<html") for source in layout_sources), 1)

    def test_marketing_and_workspace_routes_are_isolated(self) -> None:
        marketing_source = self.marketing_source()
        canvas_source = (ROOT / "app" / "canvas" / "page.tsx").read_text(
            encoding="utf-8"
        )

        self.assertNotIn('href="/canvas"', marketing_source)
        self.assertNotIn('from "@/components/workspace', marketing_source)
        self.assertNotIn('from "@/lib/generation-stream', marketing_source)
        self.assertNotIn('from "@/lib/lesson-library', marketing_source)
        self.assertNotIn('from "@/lib/live-session', marketing_source)
        self.assertNotIn('from "next/link"', canvas_source)
        self.assertNotIn('href="/"', canvas_source)
        self.assertIn('aria-label="Imagine educator workspace"', canvas_source)

    def test_public_content_matches_the_evidence_contract(self) -> None:
        marketing_source = self.marketing_source()

        required = [
            "Keep teaching. Let the picture take shape.",
            "Illustrative product walkthrough — non-interactive",
            "Prepare 3–5 diagrams",
            "Imagine, show me &lt;phrase&gt;",
            "browser’s local storage",
            "Show a process as it unfolds",
            "Make hierarchy visible",
            "Invitation-only pilots",
            "Preparation effort",
            "Educator usability",
            "Prepared-recall reliability",
            "Lesson continuity",
            "A school-selected comprehension signal",
            "AP Biology",
            "Vivaan Grover",
            "Jackson Bizell",
            "Krish Sapovadia",
            "Lecture halls, boardrooms, and keynote stages",
        ]
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, marketing_source)

        banned = [
            "try imagine",
            "pricing",
            "margin",
            "enrollment",
            "revenue",
            "competitor",
            "case study",
            "traction",
            "guaranteed latency",
            "quantified prep",
        ]
        lowered = marketing_source.lower()
        for phrase in banned:
            with self.subTest(phrase=phrase):
                self.assertNotIn(phrase, lowered)

    def test_public_navigation_and_mobile_menu_are_accessible(self) -> None:
        header = (ROOT / "components" / "marketing" / "site-header.tsx").read_text(
            encoding="utf-8"
        )
        layout = (ROOT / "app" / "(marketing)" / "layout.tsx").read_text(
            encoding="utf-8"
        )

        for label in ["Product", "Educators", "Schools", "About"]:
            self.assertIn(f'label: "{label}"', header)
        self.assertIn("aria-expanded={open}", header)
        self.assertIn('aria-controls="marketing-mobile-navigation"', header)
        self.assertIn('event.key === "Escape"', header)
        self.assertIn('event.key !== "Tab"', header)
        self.assertIn('document.addEventListener("pointerdown"', header)
        self.assertIn("firstMenuLinkRef.current?.focus()", header)
        self.assertIn("element.inert = true", header)
        self.assertIn("toggleRef.current?.focus()", header)
        self.assertIn('window.matchMedia("(min-width: 721px)")', header)
        self.assertIn("activeElement.dataset.navigationHref", header)
        self.assertIn("desktopLinkRefs.current[activeMobileHref]", header)
        self.assertIn("desktopFocusTarget.focus()", header)
        self.assertIn('href="#main-content"', layout)
        self.assertIn("data-lenis-prevent", header)

    def test_marketing_photos_are_stable_optimized_jpegs(self) -> None:
        assets = {
            "imagine-founders-showcase.jpg": (1152, 1536, 300_000),
            "jackson-portrait.jpg": (800, 800, 100_000),
            "vivaan-portrait.jpg": (1200, 896, 350_000),
            "krish-portrait.jpg": (1043, 1451, 300_000),
        }
        for filename, (width, height, max_bytes) in assets.items():
            path = ROOT / "public" / "media" / filename
            with self.subTest(filename=filename):
                self.assertTrue(path.is_file())
                payload = path.read_bytes()
                self.assertEqual(payload[:2], b"\xff\xd8")
                self.assertEqual(jpeg_dimensions(path), (width, height))
                self.assertLess(len(payload), max_bytes)
                self.assertNotIn(b"Exif\x00\x00", payload)

        home = (ROOT / "app" / "(marketing)" / "page.tsx").read_text(
            encoding="utf-8"
        )
        about = (ROOT / "app" / "(marketing)" / "about" / "page.tsx").read_text(
            encoding="utf-8"
        )
        self.assertIn('src="/media/imagine-founders-showcase.jpg"', home)
        self.assertIn('objectPosition: "26.7% 38.5%"', home)
        self.assertIn(
            'alt="The three Imagine founders presenting together in a lecture hall."',
            home,
        )
        expected_portraits = [
            (
                "Vivaan Grover",
                "/media/vivaan-portrait.jpg",
                "34.9% 31.1%",
                "Vivaan Grover wearing a white suit beside a canal.",
            ),
            (
                "Jackson Bizell",
                "/media/jackson-portrait.jpg",
                "38.7% 31.7%",
                "Jackson Bizell wearing a dark suit in a museum.",
            ),
            (
                "Krish Sapovadia",
                "/media/krish-portrait.jpg",
                "23% 37.3%",
                "Krish Sapovadia smiling at a mountain overlook.",
            ),
        ]
        for name, path, focus, alt in expected_portraits:
            with self.subTest(name=name):
                self.assertIn(f'name: "{name}"', about)
                self.assertIn(f'photo: "{path}"', about)
                self.assertIn(f'focus: "{focus}"', about)
                self.assertIn(f'alt: "{alt}"', about)
        self.assertNotIn("tabIndex={0}", about)

    def test_marketing_scroll_lifecycle_and_motion_guards(self) -> None:
        package = json.loads((ROOT / "package.json").read_text())
        package_lock = (ROOT / "package-lock.json").read_text(encoding="utf-8")
        layout = (ROOT / "app" / "(marketing)" / "layout.tsx").read_text(
            encoding="utf-8"
        )
        smooth_scroll = (
            ROOT / "components" / "marketing" / "smooth-scroll.tsx"
        ).read_text(encoding="utf-8")
        motion = (
            ROOT / "components" / "marketing" / "motion-boundary.tsx"
        ).read_text(encoding="utf-8")

        self.assertEqual(package["dependencies"]["lenis"], "^1.3.25")
        self.assertIn('"node_modules/lenis"', package_lock)
        self.assertIn('import "lenis/dist/lenis.css"', layout)
        self.assertIn("<MarketingSmoothScroll />", layout)
        for phrase in [
            '"(prefers-reduced-motion: reduce)"',
            '"(pointer: coarse)"',
            'lenis.on("scroll", updateScroll)',
            'lenis.off("scroll", updateScroll)',
            "gsap.ticker.add(updateFrame)",
            "gsap.ticker.remove(updateFrame)",
            "lenis.destroy()",
        ]:
            self.assertIn(phrase, smooth_scroll)
        self.assertNotIn("killAll", smooth_scroll)

        self.assertIn("ScrollTrigger", motion)
        self.assertIn("motionMedia.add(", motion)
        self.assertIn(
            'reduceMotion: "(prefers-reduced-motion: reduce)"', motion
        )
        self.assertIn(
            'allowMotion: "(prefers-reduced-motion: no-preference)"', motion
        )
        self.assertIn('desktop: "(min-width: 901px)"', motion)
        self.assertIn('finePointer: "(pointer: fine)"', motion)
        self.assertIn("if (reduceMotion)", motion)
        self.assertIn("return () => motionMedia.revert()", motion)
        self.assertNotIn("window.matchMedia", motion)
        self.assertIn("pin: productStoryPin", motion)
        self.assertEqual(motion.count("pin: productStoryPin"), 1)
        self.assertIn("scrub: 0.65", motion)
        self.assertIn("[data-parallax-media]", motion)
        self.assertNotIn("killAll", motion)

    def test_marketing_previews_use_real_renderer_and_accessible_modes(self) -> None:
        previews = (
            ROOT / "components" / "marketing" / "diagram-previews.tsx"
        ).read_text(encoding="utf-8")
        accordion = (
            ROOT / "components" / "marketing" / "product-mode-accordion.tsx"
        ).read_text(encoding="utf-8")
        pages = "\n".join(
            (ROOT / "app" / "(marketing)" / route / "page.tsx").read_text(
                encoding="utf-8"
            )
            for route in ["product", "educators", "schools"]
        )

        self.assertIn('from "@/components/building-blocks"', previews)
        self.assertIn("<DiagramRenderer", previews)
        self.assertNotIn("components/workspace", previews)
        self.assertNotIn("generation-stream", previews)
        self.assertNotIn("lesson-library", previews)
        self.assertGreaterEqual(pages.count("<MarketingDiagramPreview"), 3)
        for phrase in [
            "aria-expanded={expanded}",
            "aria-controls={`product-mode-panel-${mode.id}`}",
            'role="region"',
            'event.key === "ArrowRight"',
            'event.key === "ArrowLeft"',
            'event.key === "Home"',
            'event.key === "End"',
            'window.matchMedia("(max-width: 720px)")',
        ]:
            self.assertIn(phrase, accordion)

    def test_canvas_is_not_indexed_or_in_the_public_sitemap(self) -> None:
        canvas_layout = (ROOT / "app" / "canvas" / "layout.tsx").read_text(
            encoding="utf-8"
        )
        robots = (ROOT / "app" / "robots.ts").read_text(encoding="utf-8")
        sitemap = (ROOT / "app" / "sitemap.ts").read_text(encoding="utf-8")
        site_origin = (ROOT / "lib" / "site-origin.ts").read_text(
            encoding="utf-8"
        )

        self.assertIn("index: false", canvas_layout)
        self.assertIn("follow: false", canvas_layout)
        self.assertIn('disallow: "/canvas"', robots)
        self.assertIn("getSiteOrigin()", robots)
        self.assertIn("`${origin}/sitemap.xml`", robots)
        self.assertNotIn('"/canvas"', sitemap)
        self.assertIn("getSiteOrigin()", sitemap)
        self.assertIn('"http://localhost:3000"', site_origin)
        self.assertIn('replace(/\\/+$/, "")', site_origin)
        for route in ['"/product"', '"/educators"', '"/schools"', '"/about"']:
            self.assertIn(route, sitemap)

    def test_superseded_marketing_runtime_is_removed(self) -> None:
        removed = [
            "app/loading.tsx",
            "app/debug/page.tsx",
            "components/marketing-experience.tsx",
            "components/knowledge-scene.tsx",
            "components/launch-loader.tsx",
            "components/smooth-scroll.tsx",
            "components/diagrams/structured-diagram.tsx",
            "components/building-blocks/debug.tsx",
            "components/building-blocks/sample-data.ts",
        ]
        for relative_path in removed:
            with self.subTest(path=relative_path):
                self.assertFalse((ROOT / relative_path).exists())

        package = json.loads((ROOT / "package.json").read_text())
        self.assertEqual(package["dependencies"]["lenis"], "^1.3.25")


if __name__ == "__main__":
    unittest.main()
