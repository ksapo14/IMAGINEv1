import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def jpeg_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    cursor = 2
    start_of_frame = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
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
            return (int.from_bytes(data[cursor + 5 : cursor + 7], "big"), int.from_bytes(data[cursor + 3 : cursor + 5], "big"))
        cursor += segment_length
    raise AssertionError(f"{path} has no JPEG start-of-frame marker")


def png_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise AssertionError(f"{path} is not a PNG")
    return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")


class FrontendContractTests(unittest.TestCase):
    def source(self, relative_path: str) -> str:
        return (ROOT / relative_path).read_text(encoding="utf-8")

    def marketing_source(self) -> str:
        files = [
            *sorted((ROOT / "app" / "(marketing)").rglob("*.tsx")),
            *sorted((ROOT / "components" / "marketing").rglob("*.tsx")),
            *sorted((ROOT / "components" / "marketing").rglob("*.ts")),
        ]
        return "\n".join(path.read_text(encoding="utf-8") for path in files)

    def test_pitch_routes_and_server_are_absent_from_website(self) -> None:
        for relative_path in ["app/pitch/page.tsx", "app/pitch/layout.tsx", "app/canvas/page.tsx", "app/canvas/layout.tsx", "backend/main.py", "backend.Dockerfile"]:
            with self.subTest(relative_path=relative_path):
                self.assertFalse((ROOT / relative_path).exists())
        compose = self.source("docker-compose.yml")
        self.assertIn("website:", compose)
        self.assertNotIn("backend:", compose)
        self.assertNotIn("backend.Dockerfile", compose)

    def test_development_and_vercel_build_contracts_remain(self) -> None:
        package = self.source("package.json")
        vercel = self.source("vercel.json")
        build = self.source("scripts/vercel-build.mjs")
        npmrc = self.source(".npmrc")
        self.assertIn('"dev":', package)
        self.assertIn('"installCommand": "npm ci"', vercel)
        self.assertIn("nextCli", build)
        self.assertNotIn("NEXT_PUBLIC_FRONTEND_ONLY", build)
        self.assertIn("legacy-peer-deps=true", npmrc)

    def test_site_origin_sitemap_and_robots_publish_marketing(self) -> None:
        origin = self.source("lib/site-origin.ts")
        sitemap = self.source("app/sitemap.ts")
        robots = self.source("app/robots.ts")
        self.assertIn("NEXT_PUBLIC_SITE_URL", origin)
        self.assertIn("getSiteOrigin", sitemap)
        self.assertNotIn('"/pitch"', sitemap)
        self.assertIn('allow: "/"', robots)

    def test_public_routes_share_marketing_layout_and_are_isolated_from_pitch(self) -> None:
        layout = self.source("app/(marketing)/layout.tsx")
        marketing = self.marketing_source()
        self.assertIn("Marketing", layout)
        self.assertIn("Imagine", marketing)
        self.assertNotIn("PitchWorkspace", marketing)

    def test_marketing_navigation_and_content_keep_accessible_structure(self) -> None:
        marketing = self.marketing_source()
        self.assertIn("aria-", marketing)
        self.assertIn("href=", marketing)
        self.assertIn("Imagine", marketing)
        self.assertIn("educator", marketing.lower())

    def test_marketing_assets_are_present_and_use_optimized_formats(self) -> None:
        media = ROOT / "public" / "media"
        expected = ["imagine-founders-showcase.jpg", "jackson-portrait.jpg", "krish-portrait.jpg", "vivaan-portrait.jpg"]
        for filename in expected:
            with self.subTest(filename=filename):
                asset = media / filename
                self.assertTrue(asset.is_file())
                self.assertTrue(asset.read_bytes().startswith(b"\xff\xd8"))
        self.assertTrue((media / "diagrams" / "cumulative-board-flow.png").is_file())

    def test_marketing_motion_and_cleanup_guards_remain(self) -> None:
        source = self.marketing_source()
        styles = self.source("app/globals.css")
        self.assertIn("prefers-reduced-motion", styles)
        self.assertIn("marketing-", styles)
        self.assertNotIn("LiveWhiteboard", source)

    def test_root_layout_retains_language_theme_and_brand_metadata(self) -> None:
        layout = self.source("app/layout.tsx")
        self.assertIn('<html lang="en"', layout)
        self.assertIn("ThemeProvider", layout)
        self.assertIn("imagineer-shortform.png", layout)

    def test_readme_documents_local_function_gemma(self) -> None:
        readme = self.source("README.md")
        self.assertIn("FunctionGemma", readme)
        self.assertIn("desktop/", readme)
        self.assertNotIn("FUNCTION_GEMMA_BASE_URL", readme)

    def test_development_website_has_no_backend_launcher(self) -> None:
        package = json.loads(self.source("package.json"))
        self.assertEqual(package["scripts"]["dev"], "next dev")
        self.assertNotIn("dev:backend", package["scripts"])
        self.assertFalse((ROOT / "scripts" / "dev.ps1").exists())

    def test_cloudflare_runtime_is_not_part_of_the_project(self) -> None:
        package = json.loads(self.source("package.json"))
        lockfile = self.source("package-lock.json")
        vite_config = self.source("vite.config.ts")
        for dependency in ["@cloudflare/vite-plugin", "wrangler"]:
            self.assertNotIn(dependency, package["devDependencies"])
            self.assertNotIn(dependency, lockfile)
            self.assertNotIn(dependency, vite_config)
        self.assertNotIn('"node_modules/workerd"', lockfile)
        self.assertFalse((ROOT / "worker").exists())

    def test_vercel_install_and_website_build_are_specific(self) -> None:
        npmrc = self.source(".npmrc").splitlines()
        vercel = json.loads(self.source("vercel.json"))
        package = json.loads(self.source("package.json"))
        wrapper = self.source("scripts/vercel-build.mjs")
        next_config = self.source("next.config.mjs")
        self.assertEqual(npmrc, ["legacy-peer-deps=true"])
        self.assertEqual(vercel["installCommand"], "npm ci")
        self.assertEqual(vercel["buildCommand"], "npm run build:vercel")
        self.assertEqual(package["scripts"]["build"], "vinext build")
        self.assertEqual(package["scripts"]["build:vercel"], "node scripts/vercel-build.mjs")
        for phrase in ['IMAGINE_VERCEL_BUILD: "1"', 'require.resolve("next/dist/bin/next")', 'spawnSync(process.execPath, [nextCli, "build"]']:
            self.assertIn(phrase, wrapper)
        self.assertNotIn("NEXT_PUBLIC_FRONTEND_ONLY", wrapper)
        self.assertIn('process.env.IMAGINE_VERCEL_BUILD === "1"', next_config)

    def test_site_origin_and_public_environment_contracts_remain(self) -> None:
        origin = self.source("lib/site-origin.ts")
        env_example = self.source(".env.example")
        gitignore = self.source(".gitignore")
        self.assertLess(origin.index("process.env.NEXT_PUBLIC_SITE_URL"), origin.index("process.env.VERCEL_PROJECT_PRODUCTION_URL"))
        self.assertIn('`https://${productionHost', origin)
        self.assertIn('replace(/\\/+$/, "")', origin)
        self.assertIn(".vercel/", gitignore.splitlines())
        for name in ["NEXT_PUBLIC_SITE_URL=", "DEEPGRAM_API_KEY="]:
            self.assertIn(name, env_example)

    def test_public_routes_and_workspace_are_isolated(self) -> None:
        marketing = ROOT / "app" / "(marketing)"
        routes = ["page.tsx", "product/page.tsx", "educators/page.tsx", "schools/page.tsx", "about/page.tsx", "contact/page.tsx"]
        self.assertTrue((marketing / "layout.tsx").is_file())
        for relative_path in routes:
            self.assertTrue((marketing / relative_path).is_file())
        marketing_source = self.marketing_source()
        self.assertNotIn('href="/canvas"', marketing_source)
        self.assertNotIn('href="/pitch"', marketing_source)
        self.assertNotIn("components/workspace", marketing_source)
        self.assertNotIn("PitchWorkspace", marketing_source)

    def test_public_content_matches_the_evidence_contract(self) -> None:
        source = self.marketing_source()
        required = ["Imaginer", "Revolutionizing the way people explain things", "Keep teaching. Let the picture take shape.", "Illustrative product walkthrough — non-interactive", "Save lesson context", "Interpret finalized speech", "Build one cumulative board", "Invitation-only pilots", "Context-entry effort", "Educator usability", "Scene decision reliability", "Lesson continuity", "A school-selected comprehension signal", "AP Biology", "Vivaan Grover", "Jackson Bizell", "Krish Sapovadia", "Lecture halls, boardrooms, and keynote stages", "Coming Soon", "Core values", "Help test Imaginev1 in the classroom."]
        for phrase in required:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, source)
        for phrase in ["prepare 3–5 diagrams", "exact prepared-recall", "try imagine", "pricing", "guaranteed latency"]:
            with self.subTest(phrase=phrase):
                self.assertNotIn(phrase, source.lower())

    def test_mobile_menu_keeps_focus_escape_and_inert_accessibility_guards(self) -> None:
        header = self.source("components/marketing/site-header.tsx")
        footer = self.source("components/marketing/site-footer.tsx")
        layout = self.source("app/(marketing)/layout.tsx")
        for source in [header, footer]:
            for phrase in ['href: "/"', 'href: "/product"', 'href: "/about"', 'href: "/contact"']:
                self.assertIn(phrase, source)
        for phrase in ["aria-expanded={open}", 'aria-controls="marketing-mobile-navigation"', 'event.key === "Escape"', 'event.key !== "Tab"', 'document.addEventListener("pointerdown"', "firstMenuLinkRef.current?.focus()", "element.inert = true", "toggleRef.current?.focus()", 'window.matchMedia("(min-width: 721px)")']:
            self.assertIn(phrase, header)
        self.assertIn('href="#main-content"', layout)

    def test_aligned_marketing_pages_publish_requested_content(self) -> None:
        home = self.source("app/(marketing)/page.tsx")
        product = self.source("app/(marketing)/product/page.tsx")
        about = self.source("app/(marketing)/about/page.tsx")
        contact = self.source("app/(marketing)/contact/page.tsx")
        for phrase in ["<h1>Imaginer</h1>", "Revolutionizing the way people explain things", "marketing-home-hero"]:
            self.assertIn(phrase, home)
        for phrase in ["Imaginev1", "data-product-flow", "data-product-flow-step", "Coming Soon", 'href="/contact"']:
            self.assertIn(phrase, product)
        self.assertIn("Core values", about)
        self.assertIn('title="Founder Team"', about)
        self.assertIn("export const metadata: Metadata", contact)
        for email in ["kcsapovadia@gmail.com", "vpvpgrover09@gmail.com", "jbizell09@gmail.com"]:
            self.assertIn(email, contact)

    def test_marketing_photos_have_exact_dimensions_size_and_no_exif(self) -> None:
        assets = {"imagine-founders-showcase.jpg": (1152, 1536, 300_000), "jackson-portrait.jpg": (800, 800, 100_000), "vivaan-portrait.jpg": (1200, 896, 350_000), "krish-portrait.jpg": (1043, 1451, 300_000)}
        for filename, (width, height, max_bytes) in assets.items():
            path = ROOT / "public" / "media" / filename
            with self.subTest(filename=filename):
                payload = path.read_bytes()
                self.assertEqual(payload[:2], b"\xff\xd8")
                self.assertEqual(jpeg_dimensions(path), (width, height))
                self.assertLess(len(payload), max_bytes)
                self.assertNotIn(b"Exif\x00\x00", payload)

    def test_marketing_motion_lifecycle_has_reduced_motion_and_cleanup(self) -> None:
        layout = self.source("app/(marketing)/layout.tsx")
        scroll = self.source("components/marketing/smooth-scroll.tsx")
        motion = self.source("components/marketing/motion-boundary.tsx")
        styles = self.source("app/globals.css")
        self.assertIn('import "lenis/dist/lenis.css"', layout)
        for phrase in ['"(prefers-reduced-motion: reduce)"', 'lenis.on("scroll", updateScroll)', 'lenis.off("scroll", updateScroll)', "gsap.ticker.add(updateFrame)", "gsap.ticker.remove(updateFrame)", "lenis.destroy()"]:
            self.assertIn(phrase, scroll)
        for phrase in ["ScrollTrigger", "motionMedia.add(", 'reduceMotion: "(prefers-reduced-motion: reduce)"', "return () => motionMedia.revert()", "[data-parallax-media]", "[data-product-flow-step]"]:
            self.assertIn(phrase, motion)
        self.assertIn(".marketing-root [data-product-flow-step]", styles)

    def test_static_diagram_previews_keep_exact_page_mappings(self) -> None:
        previews = self.source("components/marketing/diagram-previews.tsx")
        pages = {"home": self.source("app/(marketing)/page.tsx"), "product": self.source("app/(marketing)/product/page.tsx"), "educators": self.source("app/(marketing)/educators/page.tsx"), "schools": self.source("app/(marketing)/schools/page.tsx")}
        self.assertIn('from "next/image"', previews)
        self.assertNotIn("components/workspace", previews)
        expected = {"home": ["/media/diagrams/lesson-context-flow.png", "/media/diagrams/cellular-energy-flow.png", "/media/diagrams/cumulative-board-flow.png"], "product": ["/media/diagrams/cumulative-board-flow.png"], "educators": ["/media/diagrams/respiration-update.png"], "schools": ["/media/diagrams/pilot-review-flow.png"]}
        for page, assets in expected.items():
            for asset in assets:
                self.assertIn(asset, pages[page])
                width, height = png_dimensions(ROOT / "public" / asset.removeprefix("/"))
                self.assertEqual(width * 2, height * 3)
        self.assertEqual(pages["home"].count("<MarketingScenePreview"), 1)
        self.assertIn("productModes.map", pages["home"])

    def test_marketing_cleanup_and_removed_runtimes_remain_enforced(self) -> None:
        source = self.marketing_source() + self.source("app/globals.css")
        for phrase in ["marketing-eyebrow", "data-product-story", "marketing-visual-marquee"]:
            self.assertNotIn(phrase, source)
        for relative_path in ["app/loading.tsx", "app/debug/page.tsx", "components/marketing-experience.tsx", "components/knowledge-scene.tsx", "components/launch-loader.tsx", "components/smooth-scroll.tsx", "components/diagrams/structured-diagram.tsx", "components/building-blocks/debug.tsx", "components/building-blocks/sample-data.ts", "components/workspace/composition-view.tsx", "lib/composition-summary.ts"]:
            self.assertFalse((ROOT / relative_path).exists())

    def test_sitemap_contains_only_public_marketing_routes(self) -> None:
        robots = self.source("app/robots.ts")
        sitemap = self.source("app/sitemap.ts")
        self.assertIn('allow: "/"', robots)
        self.assertIn('const publicRoutes = ["", "/product", "/about", "/contact"]', sitemap)
        for route in ['"/canvas"', '"/pitch"', '"/educators"', '"/schools"']:
            self.assertNotIn(route, sitemap)
