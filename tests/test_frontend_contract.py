import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FrontendContractTests(unittest.TestCase):
    def test_canvas_route_exists(self) -> None:
        canvas_page = ROOT / "app" / "canvas" / "page.tsx"
        self.assertTrue(canvas_page.is_file())
        self.assertIn("export default function CanvasPage", canvas_page.read_text())

    def test_development_frontend_uses_advertised_port(self) -> None:
        package = json.loads((ROOT / "package.json").read_text())
        self.assertIn("scripts/dev.ps1", package["scripts"]["dev"])

        dev_script = (ROOT / "scripts" / "dev.ps1").read_text()
        self.assertIn("Frontend: http://localhost:3000", dev_script)
        self.assertIn("& $next dev -p 3000", dev_script)


if __name__ == "__main__":
    unittest.main()
