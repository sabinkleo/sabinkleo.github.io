import copy
from html.parser import HTMLParser
import json
from pathlib import Path
import tempfile
import unittest
from xml.etree import ElementTree as ET

from editorial import sitegen

FIXTURE = Path(__file__).parent / "records/frete-search-console.json"


class Document(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.tags = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

    def find(self, tag, **attrs):
        return [el for name, el in self.tags if name == tag and all(el.get(k) == v for k, v in attrs.items())]


class PublicEditionTests(unittest.TestCase):
    def setUp(self):
        self.record = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out = Path(self.tmp.name) / "observatorio"

    def test_release_has_canonical_source_metadata_tools_and_consistent_feeds(self):
        paths = sitegen.build([self.record], self.out)
        slug = self.record["slug"]
        canonical = sitegen.BASE + slug + "/"
        index = Document((self.out / "index.html").read_text(encoding="utf-8"))
        self.assertTrue(index.find("a", href=f"./{slug}/"))
        self.assertTrue(index.find("form", id="filtros"))
        article = Document((self.out / slug / "index.html").read_text(encoding="utf-8"))
        self.assertTrue(article.find("link", rel="canonical", href=canonical))
        self.assertTrue(article.find("a", href=self.record["sources"][0]["url"]))
        self.assertTrue(article.find("meta", property="og:url", content=canonical))
        self.assertTrue(article.find("details"))
        self.assertEqual(len(article.find("button", **{"data-save":slug})), 1)
        links = article.find("a", **{"data-campaign": slug})
        self.assertEqual(len(links), 1)
        self.assertTrue(links[0]["href"].startswith("/raio-x-vendas/?utm_source=observatorio"))
        self.assertEqual(json.loads(links[0]["data-channels"])["linkedin"], "organic_social")
        self.assertTrue(all((self.out / path).is_file() for path in paths))
        rss = ET.parse(self.out / "feed.xml")
        self.assertEqual(rss.findtext("channel/item/link"), canonical)
        self.assertEqual(rss.findtext("channel/item/title"), self.record["social_package"]["rss"]["title"])
        sitemap = ET.parse(self.out / "sitemap.xml")
        self.assertEqual([el.text for el in sitemap.findall(".//{*}loc")], [sitegen.BASE, canonical])

    def test_unapproved_editions_are_absent_and_obsolete_generated_pages_are_removed(self):
        sitegen.build([self.record], self.out)
        protected = self.out / "manual/index.html"
        protected.parent.mkdir()
        protected.write_text("Manual", encoding="utf-8")
        # A candidate may have only the intake fields and can never become a public page.
        sitegen.build([{"content_status":"candidate", "slug": "candidate", "title":"Unverified"}], self.out)
        self.assertTrue(protected.is_file())
        self.assertFalse((self.out / self.record["slug"]).exists())
        self.assertFalse((self.out / "candidate").exists())
        self.assertNotIn("Unverified", (self.out / "feed.xml").read_text(encoding="utf-8"))
        self.assertFalse(ET.parse(self.out / "feed.xml").findall("channel/item"))

    def test_second_build_is_byte_identical_and_escapes_untrusted_record_text(self):
        self.record["title"] = 'Matéria "<script>alert(123)</script>" & frete'
        first = sitegen.build([self.record], self.out)
        content = {p:(self.out / p).read_bytes() for p in first}
        sitegen.build([self.record], self.out)
        self.assertEqual(content, {p:(self.out / p).read_bytes() for p in first})
        text = (self.out / self.record["slug"] / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("<script>alert(123)</script>", text)
        self.assertIn("&lt;script&gt;", text)
        self.assertIn(r"\u003cscript\u003e", text)

    def test_prevents_reserved_paths_unsafe_sources_and_unsafe_tool_urls(self):
        for field, value in [("slug","../escape"), ("slug","assets"), ("related_tool","//external.test/")]:
            with self.subTest(field=field, value=value):
                bad = copy.deepcopy(self.record)
                bad[field] = value
                with self.assertRaises(ValueError):
                    sitegen.build([bad], self.out)
        self.record["sources"][0]["url"] = "javascript:alert(1)"
        with self.assertRaises(ValueError):
            sitegen.build([self.record], self.out)

    def test_date_rolls_over_in_local_time(self):
        self.assertEqual(sitegen.display_date("2026-11-20T01:05:00Z"), "19 nov 2026")
