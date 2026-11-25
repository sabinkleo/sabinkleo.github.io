import copy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from editorial import model, motion_video


class MotionVideoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records = {record["slug"]: record for record in model.load_records()}

    def test_approved_directions_are_complete_and_timed(self):
        for slug, frames in (("github-cli-eventos-pr", 810), ("frete-search-console", 900)):
            with self.subTest(slug=slug), TemporaryDirectory() as folder:
                plan = motion_video.plan_record(self.records[slug])
                self.assertEqual(plan["duration_frames"], frames)
                self.assertEqual(plan["scenes"][0]["end_frame"], 90)
                self.assertEqual(plan["scenes"][-1]["visual_type"], "source")
                self.assertGreater(len({s["visual_type"] for s in plan["scenes"]}), 3)
                self.assertTrue(all(s["source_dependency"]["source_url"] == plan["lead_source"]["url"]
                                    for s in plan["scenes"]))
                self.assertEqual([s["end_frame"] for s in plan["scenes"][:-1]],
                                 [s["start_frame"] for s in plan["scenes"][1:]])
                motion_video.write_text_bundle(plan, Path(folder))
                self.assertIn(motion_video.srt_clock(frames),
                              (Path(folder) / "legendas.srt").read_text(encoding="utf-8"))

    def test_direction_refuses_a_changed_record(self):
        record = copy.deepcopy(self.records["github-cli-eventos-pr"])
        record["social_package"]["reel"][0]["title"] = "Um título revisado"
        with self.assertRaisesRegex(ValueError, "record changed"):
            motion_video.plan_record(record)

    def test_unapproved_record_never_reaches_render(self):
        record = copy.deepcopy(self.records["github-cli-eventos-pr"])
        record["content_status"] = "draft"
        record["history"].pop()
        with TemporaryDirectory() as folder:
            out = Path(folder) / "reel"
            with patch.object(model, "check_sources") as check:
                with self.assertRaisesRegex(ValueError, "approved"):
                    motion_video.render(record, out)
                check.assert_not_called()
            self.assertFalse(out.exists())

    def test_source_failure_never_exposes_output(self):
        record = self.records["github-cli-eventos-pr"]
        with TemporaryDirectory() as folder:
            out = Path(folder) / "reel"
            with patch.object(model, "check_sources", side_effect=ValueError("source check failed")):
                with self.assertRaisesRegex(ValueError, "source check failed"):
                    motion_video.render(record, out)
            self.assertFalse(out.exists())

    def test_records_without_custom_direction_reuse_approved_copy(self):
        record = self.records["frete-search-console"]
        with patch.object(Path, "read_text", return_value=json.dumps({})):
            plan = motion_video.plan_record(record)
        self.assertEqual(plan["scenes"][0]["text"], record["social_package"]["reel"][0]["voice"])
        self.assertEqual(plan["scenes"][0]["visual_type"], "comparison")
        self.assertEqual(plan["edition_type"], "educational")
