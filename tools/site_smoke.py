"""Dependency-free checks for Vértice Labs' static GitHub Pages site."""
from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
ORIGIN = "https://verticelabs.me"
REDIRECTS = {
    "tunning/index.html": "/tuning/",
    "analise-cripto/index.html": "/radar-ia-cripto/",
    "signal-lab/index.html": "/drops/",
}


class Document(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.in_title = False
        self.meta: dict[str, str] = {}
        self.canonical: list[str] = []
        self.links: list[str] = []
        self.h1_count = 0
        self.refresh = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        if tag == "title":
            self.in_title = True
        elif tag == "meta":
            if (a.get("http-equiv") or "").lower() == "refresh":
                self.refresh = a.get("content") or ""
            key = a.get("name") or a.get("property")
            if key:
                self.meta[key.lower()] = a.get("content") or ""
        elif tag == "link" and (a.get("rel") or "").lower() == "canonical":
            self.canonical.append(a.get("href") or "")
        elif tag == "a" and a.get("href"):
            self.links.append(a["href"] or "")
        elif tag == "h1":
            self.h1_count += 1

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title += data

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self.in_title = False


def expected_url(relative: Path) -> str:
    directory = relative.parent.as_posix()
    return ORIGIN + ("/" if directory == "." else "/" + directory + "/")


def local_target(page: Path, href: str) -> Path | None:
    parsed = urlsplit(href)
    if parsed.scheme or parsed.netloc or not parsed.path:
        return None
    path = unquote(parsed.path)
    if path.startswith("/"):
        target = ROOT / path.lstrip("/")
    else:
        target = page.parent / path
    target = target.resolve()
    if not target.is_relative_to(ROOT.resolve()):
        raise ValueError(f"Link escapes repository: {href}")
    if path.endswith("/") or not target.suffix:
        target = target / "index.html"
    return target


def main() -> int:
    errors: list[str] = []
    pages = sorted(ROOT.rglob("index.html"))
    if (ROOT / "CNAME").read_text(encoding="utf-8").strip() != "verticelabs.me":
        errors.append("CNAME: expected verticelabs.me")
    if len(pages) < 10:
        errors.append(f"Expected at least 10 HTML pages; found {len(pages)}")

    for page in pages:
        rel = page.relative_to(ROOT)
        name = rel.as_posix()
        html = page.read_text(encoding="utf-8")
        doc = Document()
        doc.feed(html)
        if "®" in html:
            errors.append(f"{name}: unverified registered-mark symbol")
        if not doc.title.strip():
            errors.append(f"{name}: missing title")
        if name in REDIRECTS:
            destination = REDIRECTS[name]
            delay, separator, target = doc.refresh.partition(";")
            href = target.strip().removeprefix("url=").strip()
            if (delay.strip() != "0" or not separator or not href
                    or local_target(page, href) != ROOT / destination.strip("/") / "index.html"
                    or doc.canonical != [ORIGIN + destination]):
                errors.append(f"{name}: invalid compatibility redirect")
        else:
            required = ("description", "og:title", "og:description", "og:url", "og:type")
            for key in required:
                if not doc.meta.get(key):
                    errors.append(f"{name}: missing {key}")
            if doc.canonical != [expected_url(rel)]:
                errors.append(f"{name}: canonical mismatch {doc.canonical}")
            if doc.meta.get("og:url") != expected_url(rel):
                errors.append(f"{name}: og:url mismatch")
            if doc.h1_count != 1:
                errors.append(f"{name}: expected one h1; found {doc.h1_count}")
        for href in doc.links:
            try:
                target = local_target(page, href)
            except ValueError as exc:
                errors.append(f"{name}: {exc}")
                continue
            if target is not None and not target.is_file():
                errors.append(f"{name}: broken link {href} -> {target.relative_to(ROOT)}")

    for error in errors:
        print("FAIL:", error)
    if errors:
        print(f"{len(errors)} failure(s) across {len(pages)} pages")
        return 1
    print(f"PASS: {len(pages)} pages, metadata, branding, links and CNAME")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
