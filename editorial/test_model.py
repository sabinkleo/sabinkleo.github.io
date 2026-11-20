from copy import deepcopy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from editorial import model


class EditorialContractTests(unittest.TestCase):
    def setUp(self):
        self.r = json.loads((model.HERE / "records" / "frete-search-console.json").read_text(encoding="utf-8"))
        self.source = self.r["sources"][0]

    def test_example_score_and_contract(self):
        model.validate(self.r)
        self.assertEqual(model.score(self.r), 65)
        for value, expected in ((0, 0), (5, 100)):
            self.r["rubric"] = dict.fromkeys(model.CONFIG["weights"], value)
            self.assertEqual(model.score(self.r), expected)

    def test_unreviewed_candidates_can_be_sparse(self):
        essential = set(model.SCHEMA["required"])
        item = {k: v for k, v in self.r.items() if k in essential}
        item["content_status"] = "candidate"
        item["history"] = item["history"][:1]
        item["sources"][0].pop("anchor")
        item["sources"][0]["url"] = "https://unknown.org/public-notice"
        model.validate(item)
        with self.assertRaises(ValueError):
            model.check_sources(item)

    def test_dates_and_stages(self):
        for key, value in (("verified_at", "2038-01-01T09:00:00Z"),
                           ("event_date", "2038-01-01"), ("published_at", "2038-01-01T09:00:00Z"),
                           ("updated_at", "2000-01-01T00:00:00Z"), ("event_date", "2025-02-31"),
                           ("content_status", "published"), ("history", self.r["history"][1:]),
                           ("history", self.r["history"][:-2] + self.r["history"][-1:])):
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                model.validate(dict(self.r, **{key: value}))

    def test_editorial_attestations(self):
        for gate in ("privacy", "claim", "rights"):
            with self.subTest(gate=gate), self.assertRaises(ValueError):
                model.validate(dict(self.r, review=dict(self.r["review"], **{gate: False})))
        for text in ("Contato: cliente@example.com", "CPF 111.222.333-44", "senha=serviceSecret",
                     "Contato: (41) 99999-9999"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                model.validate(dict(self.r, summary=text))

    def test_specialist_review_is_mandatory_for_risk_and_sensitive_topic(self):
        for category in ("Saúde", "Impostos", "Legislação"):
            with self.subTest(category=category), self.assertRaises(ValueError):
                model.validate(dict(self.r, category=category))
        self.r["risk"] = "tax"
        with self.assertRaises(ValueError):
            model.validate(self.r)
        self.r["review"].update(specialist="Revisor fiscal identificado", specialty="Fiscal", human=True,
                                reviewed_at=self.r["verified_at"])
        model.validate(self.r)

    def test_verified_brazil_and_demand_require_support(self):
        for change in (dict(brazil_status="confirmed"), dict(opportunity_status="evidenced"),
                       dict(summary="O painel está disponível no Brasil.")):
            with self.subTest(change=change), self.assertRaises(ValueError):
                model.validate(dict(self.r, **change))
        self.r.update(brazil_status="confirmed", brazil_source=self.source["url"])
        with self.assertRaises(ValueError):
            model.validate(self.r)
        self.r["review"]["br_scope"] = True
        model.validate(self.r)

    def test_source_owners_and_duplicate_providers(self):
        self.source["kind"] = "independent"
        for hostname, publisher in (("support.google.com", "Segundo site do Google"),
                                    ("github.blog", self.source["publisher"])):
            other = dict(self.source, url="https://" + hostname + "/report", publisher=publisher)
            with self.subTest(hostname=hostname), self.assertRaises(ValueError):
                model.validate(dict(self.r, sources=[self.source, other]))
        other = dict(self.source, url="https://github.blog/report", publisher="GitHub")
        model.validate(dict(self.r, sources=[self.source, other]))
        with self.assertRaises(ValueError):
            model.validate(dict(self.r, sources=[dict(self.source, url="https://unknown.org/x")]))

    def test_normalization_and_batch_dedup(self):
        url = "https://developers.google.com/x"
        self.assertEqual(model.normalized_url(url + "/?utm_source=foo&lang=pt#sample"), url + "?lang=pt")
        for bad in ("http://example.org", "https://user@example.org/x", "https://127.0.0.1",
                    "https://x.local/armazenado", url + "?token=private", "https://host.example.org:9000"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                model.normalized_url(bad)
        with TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "entry.json").write_text(json.dumps(self.r))
            other = deepcopy(self.r)
            other.update(id="distinct", slug="distinct")
            other["sources"][0]["url"] += "?utm_medium=clonado"
            (root / "other.json").write_text(json.dumps(other))
            with self.assertRaisesRegex(ValueError, "duplicate"):
                model.load_records(root)

    def test_live_content_requires_actual_date_visible_anchor_and_original_copy(self):
        anchor = self.source["anchor"]
        date = "12 de novembro de 2025"
        body = model.SourceDocument(f"{date}. {anchor}.", ())
        with patch.object(model, "_source_text", return_value=body):
            self.assertEqual(len(model.check_sources(self.r)), 1)
            self.r["summary"] = " ".join(["palavra"] * 30)
            copied = model.SourceDocument(body.text + " " + self.r["summary"], ())
            with patch.object(model, "_source_text", return_value=copied), self.assertRaisesRegex(ValueError, "verbatim"):
                model.check_sources(self.r)
        for text in (date, anchor):
            with patch.object(model, "_source_text", return_value=model.SourceDocument(text, ())), self.assertRaises(ValueError):
                model.check_sources(self.r)

    def test_extracts_visible_evidence_only(self):
        parser = model._PublicText()
        parser.feed('<html><head><meta property="article:published_time" content="2025-11-12"></head>'
                    '<body><script>sensitive text</script><p>frete &amp; entrega</p><style>css</style></body></html>')
        self.assertEqual(" ".join(parser.parts), "frete & entrega")
        self.assertIn("2025-11-12", parser.dates)


if __name__ == "__main__":
    unittest.main()
