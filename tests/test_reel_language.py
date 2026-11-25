import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from run_reel import COPY, Source, localized_source, write_outputs


class ReelLanguageTests(unittest.TestCase):
    def test_english_labels(self):
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder)
            write_outputs(out, "Example", "Example announcement.", "Company", None,
                          "https://example.com", "https://example.com/demo.mp4")
            article = (out / "article.md").read_text()
            social = (out / "social.md").read_text()
            self.assertIn("Publication date", article)
            self.assertIn("Source: Company", social)
            self.assertNotIn("Fonte", article + social)
            self.assertEqual(COPY["en"]["closing"], "What changes in practice?")

    def test_portuguese_labels(self):
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder)
            write_outputs(out, "Exemplo", "Anúncio.", "Empresa", None,
                          "https://example.com", "https://example.com/demo.mp4", "pt")
            self.assertIn("Fonte: Empresa", (out / "social.md").read_text())

    def test_cross_language_requires_review(self):
        source = Source('<html lang="pt-BR"><h1>Exemplo</h1></html>')
        with self.assertRaises(ValueError):
            localized_source(source, "https://example.com", "Exemplo", "Anúncio", "en", None)
        with tempfile.TemporaryDirectory() as folder:
            translation = Path(folder) / "translation.json"
            translation.write_text(json.dumps(dict(source_url="https://example.com",
                source_title="Exemplo", source_summary="Anúncio", lang="en",
                title="Example", summary="Announcement")))
            self.assertEqual(localized_source(source, "https://example.com", "Exemplo",
                "Anúncio", "en", translation), ("Example", "Announcement"))
            with self.assertRaises(ValueError):
                localized_source(source, "https://example.com", "Changed",
                    "Anúncio", "en", translation)

    def test_matching_language(self):
        source = Source('<html lang="en-US"><h1>Example</h1></html>')
        self.assertEqual(localized_source(source, "https://example.com", "Example",
            "Announcement", "en", None), ("Example", "Announcement"))


if __name__ == "__main__":
    unittest.main()
