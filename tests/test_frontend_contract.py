import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FrontendContractTests(unittest.TestCase):
    def test_canvas_route_exists(self) -> None:
        canvas_page = ROOT / "app" / "canvas" / "page.tsx"
        self.assertTrue(canvas_page.is_file())
        canvas_source = canvas_page.read_text(encoding="utf-8")
        self.assertIn("export default function CanvasPage", canvas_source)
        self.assertIn('type DashboardTab = "overview"', canvas_source)
        self.assertIn('activeTab === "prepare"', canvas_source)
        self.assertIn('activeTab === "teach"', canvas_source)

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

    def test_development_frontend_uses_advertised_port(self) -> None:
        package = json.loads((ROOT / "package.json").read_text())
        self.assertIn("scripts/dev.ps1", package["scripts"]["dev"])

        dev_script = (ROOT / "scripts" / "dev.ps1").read_text()
        self.assertIn("Frontend: http://localhost:3000", dev_script)
        self.assertIn("& $next dev -p 3000", dev_script)


if __name__ == "__main__":
    unittest.main()
