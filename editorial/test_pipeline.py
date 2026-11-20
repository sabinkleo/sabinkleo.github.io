import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from editorial import pipeline, pr_guard
from editorial.model import load_records

DEMO = pipeline.ROOT / "editorial/records/frete-search-console.json"


class PipelineTests(unittest.TestCase):
    def test_correction_keeps_an_append_only_history(self):
        old = json.loads(DEMO.read_text(encoding="utf-8"))
        changed = copy.deepcopy(old)
        changed["title"] += "?"
        with self.assertRaisesRegex(ValueError, "history"):
            pr_guard.verify_revision(old, changed)
        changed["history"].append({"at": "2026-11-20T12:00:00Z", "status": "published", "note": "Edição conferida"})
        changed["updated_at"] = "2026-11-20T12:00:00Z"
        pr_guard.verify_revision(old, changed)
        changed["slug"] = "moved"
        with self.assertRaisesRegex(ValueError, "permanent URL"):
            pr_guard.verify_revision(old, changed)

    def test_failed_media_never_exposes_a_bundle(self):
        with tempfile.TemporaryDirectory() as tmp, patch("editorial.model.check_sources", return_value=[]), \
                patch("editorial.media.render", side_effect=ValueError("bad voice")):
            dest = Path(tmp) / "review"
            with self.assertRaisesRegex(ValueError, "bad voice"):
                pipeline.run(DEMO.parent, dest, True)
            self.assertFalse(dest.exists())

    def test_empty_news_day_and_unrelated_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            empty = root / "records"
            empty.mkdir()
            dest = root / "review"
            summary = pipeline.run(empty, dest)
            self.assertEqual(summary["accepted"], 0)
            self.assertIn("Nenhuma edição", (dest / "guia-educativo.md").read_text(encoding="utf-8"))
            target = root / "live"
            page = target / "old/index.html"
            page.parent.mkdir(parents=True)
            page.write_text("old", encoding="utf-8")
            (target / pipeline.MANIFEST).write_text('{"old":"old"}')
            other = target / "local.txt"
            other.write_text("manual")
            pipeline.sync_site(dest / "site/observatorio", target)
            self.assertTrue(other.exists())
            self.assertFalse(page.exists())

    def test_reusable_guide_identifies_original_date(self):
        record = load_records(DEMO.parent)[0]
        guide = pipeline.fallback([record])
        self.assertIn("Guia educativo de arquivo", guide)
        self.assertIn(record["event_date"], guide)
        self.assertIn(record["sources"][0]["url"], guide)
