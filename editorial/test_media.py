import copy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from PIL import Image, ImageDraw

from editorial import media


ROOT = Path(__file__).resolve().parent


class MediaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.record = json.loads((ROOT / "records/frete-search-console.json").read_text(encoding="utf-8"))

    def test_unapproved_never_produces_a_file(self):
        item = dict(self.record, content_status="draft")
        with TemporaryDirectory() as tmp:
            output = Path(tmp) / "slug"
            with self.assertRaisesRegex(ValueError, "approved"):
                media.render(item, output)
            self.assertFalse(output.exists())

    def test_missing_story_fails_before_render(self):
        item = copy.deepcopy(self.record)
        item["social_package"]["stories"].pop()
        with TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, "3 stories"):
                media.render(item, Path(tmp) / "slug")

    def test_text_cannot_be_clipped_or_silently_truncated(self):
        canvas = Image.new("RGB", (80, 80))
        with self.assertRaisesRegex(ValueError, "overflows"):
            media.block(ImageDraw.Draw(canvas), "W" * 80, (0, 0, 70, 75),
                        size=36, minimum=28, fill="white")

    def test_demo_fits_each_layout_with_and_without_comparison(self):
        item = copy.deepcopy(self.record)
        for with_comparison in (True, False):
            if not with_comparison:
                item["social_package"].pop("comparison", None)
            for kind in ("carousel", "stories", "reel"):
                for i, entry in enumerate(item["social_package"][kind]):
                    with self.subTest(kind=kind, index=i, comparison=with_comparison):
                        image = media.plate(item, kind, i, entry)
                        self.assertEqual(image.size, (1080, 1350 if kind == "carousel" else 1920))

    def test_captions_follow_exact_25fps_clock(self):
        self.assertEqual(media.clock(117), "00:00:04,680")
        self.assertEqual(media.clock(505), "00:00:20,200")
