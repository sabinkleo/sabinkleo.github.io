from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from editorial import intake


class IntakeTests(unittest.TestCase):
    def setUp(self):
        self.today = datetime.now(timezone.utc).date().isoformat()
        self.source = {"title": "Novo relatório de busca", "url": "https://developers.google.com/search/blog/reports",
                       "date": self.today}
        self.radar = {"title": "O que muda nos relatórios de busca", "event_date": self.today,
                      "primary_sources": [self.source], "id": "../elsewhere", "summary": "private conversation",
                      "status": "published", "review": {"claim": True}, "social": {"extra": "ignored"}}
        self.feed = json.loads(intake.FEEDS.read_text())[0]
        self.state = {"version": 1, "validators": {}, "candidates": {}}

    def xml(self, url=None):
        url = url or self.source["url"]
        return (f"<rss><channel><item><title>Busca nas lojas</title><link>{url}</link>"
                f"<pubDate>{self.today}</pubDate><description><![CDATA[<!DOCTYPE html>full article ignored]]></description>"
                "</item></channel></rss>").encode()

    def test_actual_radar_export_and_minimal_format_have_same_public_identity(self):
        fenced = "```json\n" + json.dumps(self.radar) + "\n```"
        item, = intake.radar_entries(fenced.encode())
        minimal = {"title": "different headline", "source_url": self.source["url"] + "?utm_source=radar#snippet",
                   "source_date": self.today}
        short, = intake.radar_entries(json.dumps([minimal]).encode())
        self.assertEqual(item["id"], short["id"])
        self.assertEqual(1, intake.add_items(self.state, [item, short]))
        exported = json.dumps(self.state)
        for private in ("published", "review", "private conversation", "elsewhere", "social"):
            self.assertNotIn(private, exported)

    def test_supported_rss_atom_and_api_adapters(self):
        atom = (f'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Relatório</title>'
                f'<link rel="self" href="https://developers.google.com/technical"/>'
                f'<link href="{self.source["url"]}"/><updated>{self.today}T09:00:00Z</updated>'
                '</entry></feed>').encode()
        today = datetime.now(timezone.utc).date()
        rss, = intake.parse_feed(self.feed, self.xml(), today)
        atom_item, = intake.parse_feed(self.feed, atom, today)
        self.assertEqual(rss["id"], atom_item["id"])
        ibge = json.loads(intake.FEEDS.read_text())[2]
        ibge_article = {"titulo": "Série de varejo do IBGE", "data_publicacao": today.strftime("%d/%m/%Y 08:00:00"),
                        "link": "http://agenciadenoticias.ibge.gov.br/serie"}
        ibge_item, = intake.parse_feed(ibge, json.dumps({"items": [ibge_article]}).encode(), today)
        self.assertEqual("https://agenciadenoticias.ibge.gov.br/serie", ibge_item["sources"][0]["url"])
        self.assertNotIn("full article", json.dumps(rss))

    def test_partial_failure_preserves_good_feed_and_last_good_validator(self):
        second = dict(self.feed, id="other-feed", url="https://developers.google.com/other-feed")
        self.state["validators"][second["url"]] = {"ETag": '"last-good"'}
        def get(feed, _validators):
            return (self.xml(), {"ETag": '"fresh"'}) if feed == self.feed else (b'<html/>', {"ETag": '"bad"'})
        failed = intake.collect(self.state, [self.feed, second], fetch=get)
        self.assertEqual(["other-feed"], failed)
        self.assertEqual(1, len(self.state["candidates"]))
        self.assertEqual({"ETag": '"last-good"'}, self.state["validators"][second["url"]])
        prior = deepcopy(self.state)
        def conditional(_feed, validators):
            self.assertEqual({"ETag": '"fresh"'}, validators)
            return None, validators
        self.assertEqual([], intake.collect(self.state, [self.feed], fetch=conditional))
        self.assertEqual(prior, self.state)

    def test_conditional_http_request(self):
        error = HTTPError(self.feed["url"], 304, "Unmodified", {}, None)
        with patch("editorial.intake.build_opener") as opener:
            opener.return_value.open.side_effect = error
            old = {"ETag": '"etag"'}
            self.assertEqual((None, old), intake.download(self.feed, old))
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual('"etag"', request.get_header("If-none-match"))
            with self.assertRaises(HTTPError):
                intake.download(self.feed, {})

    def test_unsafe_or_invalid_input_is_rejected_as_a_whole(self):
        for row in (dict(self.radar, title="Write to client@example.com"), dict(self.radar, primary_sources=[]),
                    dict(self.radar, event_date="yesterday"), dict(self.radar, primary_sources=[
                        {**self.source, "url": "https://developers.google.com/item?access_token=sensitive"}])):
            with self.subTest(row=list(row)), self.assertRaises(ValueError):
                intake.radar_entries(json.dumps([self.radar, row]).encode())
        for xml in (b'<!DOCTYPE feed><rss/>', self.xml("https://other.example/story"), b"<html/>"):
            with self.assertRaises(ValueError):
                intake.parse_feed(self.feed, xml, datetime.now(timezone.utc).date())

    def test_promote_produces_valid_candidate_and_preserves_edits(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            state, inp, records = root / "queue.json", root / "radar.json", root / "records"
            inp.write_text(json.dumps(self.radar), encoding="utf-8")
            args = ["import", str(inp), "--state", str(state)]
            self.assertEqual(0, intake.main(args))
            prior = state.read_bytes()
            self.assertEqual(0, intake.main(args))
            self.assertEqual(prior, state.read_bytes())
            candidate_id, = json.loads(prior)["candidates"]
            take = ["promote", candidate_id, "--state", str(state), "--records", str(records)]
            self.assertEqual(0, intake.main(take))
            out = records / (candidate_id + ".json")
            entry = json.loads(out.read_text())
            self.assertEqual("candidate", entry["content_status"])
            entry["title"] = "Título revisado"
            intake.write_json(out, entry)
            self.assertEqual(0, intake.main(take))
            self.assertEqual(entry, json.loads(out.read_text()))


if __name__ == "__main__":
    unittest.main()
