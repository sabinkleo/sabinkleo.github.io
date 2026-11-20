import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from urllib.parse import parse_qs, urlsplit

from editorial import distribution, growth


SAMPLE = Path(__file__).with_name("records") / "frete-search-console.json"


class DistributionTests(unittest.TestCase):
    def setUp(self):
        self.article = json.loads(SAMPLE.read_text(encoding="utf-8"))

    def test_all_channels_canonical_accessibility_and_repeatability(self):
        with TemporaryDirectory() as tmp:
            folder = distribution.export(self.article, Path(tmp))
            first = {p.name: p.read_bytes() for p in folder.iterdir()}
            distribution.export(self.article, Path(tmp))
            self.assertEqual(first, {p.name: p.read_bytes() for p in folder.iterdir()})
            index = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(set(index["canais"]), set(distribution.CHANNELS))
            self.assertEqual(len(json.loads((folder / "alt.json").read_text(encoding="utf-8"))), 9)
            for name, entry in index["canais"].items():
                if entry["texto"] is None:
                    self.assertIn(name, ("hacker-news", "product-hunt"))
                    continue
                content = (folder / entry["texto"]).read_text(encoding="utf-8")
                self.assertIn(entry["destino"], content)
                url = urlsplit(entry["destino"])
                if not distribution.CHANNELS[name].medium:
                    self.assertEqual(url.query, "")
                else:
                    self.assertEqual(parse_qs(url.query)["utm_source"], [name])
                    self.assertEqual(parse_qs(url.query)["utm_campaign"], [self.article["slug"]])

    def test_launch_venue_gates_and_draft_rejection(self):
        self.article["event_type"] = "release"
        with TemporaryDirectory() as tmp:
            path = Path(tmp)
            directory = distribution.export(self.article, path)
            self.assertFalse((directory / "hacker-news.txt").exists())
            self.article["sources"][0]["url"] = "https://verticelabs.me" + self.article["related_tool"]
            distribution.export(self.article, path)
            self.assertTrue((directory / "hacker-news.txt").exists())
            self.article["event_type"] = "educational"
            distribution.export(self.article, path)
            self.assertFalse((directory / "hacker-news.txt").exists())
            self.article["content_status"] = "draft"
            with self.assertRaises(ValueError):
                distribution.export(self.article, path)


class GrowthTests(unittest.TestCase):
    def test_received_cash_profit_and_time(self):
        row = growth.template()[0]
        row.update(signed_contracts=2, paid_contracts=1, cash_received_cents=10000,
                   refunds_cents=500, direct_costs_cents=1800, allocated_expenses_and_taxes_cents=200, work_minutes=90)
        result = growth.report([row])
        self.assertEqual(result["totals"]["cash_contribution_cents"], 7700)
        self.assertEqual(result["totals"]["net_brl_per_hour"], "50.00")
        self.assertEqual(result["totals"]["net_roi_percent_on_cash_spend"], "375.00")
        self.assertIsNone(result["totals"]["qualified_conversations"])

    def test_unknowns_and_zero_time_never_imply_sale_or_profit(self):
        row = growth.template()[0]
        row.update(tool_clicks=25, diagnostics_completed=0, work_minutes=0)
        total = growth.report([row])["totals"]
        self.assertIsNone(total["net_brl_per_hour"])
        self.assertIsNone(total["net_cents"])
        self.assertIsNone(total["paid_contracts"])
        self.assertIn("Comparar", growth.next_experiment(row))
        row["diagnostics_completed"] = None
        self.assertIsNone(growth.next_experiment(row))
        second = dict(row, channel="rss", tool_clicks=None)
        self.assertIsNone(growth.report([row, second])["totals"]["tool_clicks"])

    def test_positive_revenue_and_negative_result_are_independent(self):
        row = growth.template()[0]
        row.update(cash_received_cents=1000, refunds_cents=2000, direct_costs_cents=0,
                   allocated_expenses_and_taxes_cents=0, work_minutes=60)
        result = growth.report([row])["totals"]
        self.assertEqual(result["net_brl_per_hour"], "-10.00")
        self.assertIsNone(result["net_roi_percent_on_cash_spend"])

    def test_rejects_ambiguous_data(self):
        row = growth.template()[0]
        for changes in ({"signed_contracts": 0, "paid_contracts": 1},
                        {"cash_received_cents": 1, "paid_contracts": 0},
                        {"channel": "unknown-account"}, {"email": "unused"},
                        {"month": "2026-13"}, {"direct_costs_cents": True}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                growth.report([dict(row, **changes)])
        with self.assertRaises(ValueError):
            growth.report([row, row])


if __name__ == "__main__":
    unittest.main()
