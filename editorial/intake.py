"""Receive public discovery metadata. Only an editorial review can promote its claims."""
import argparse
from contextlib import contextmanager
from datetime import date, datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlsplit
from urllib.request import build_opener, HTTPRedirectHandler, Request
from xml.etree import ElementTree as ET

from . import model

HERE = Path(__file__).resolve().parent
FEEDS = HERE / "feeds.json"
PAYLOAD_LIMIT = 1_500_000
QUERY_KEYS = {"id", "p", "page_id", "v", "article", "articleid", "hl", "lang"}


def public_text(value, max_len=240):
    if not isinstance(value, str) or not value.strip() or len(value) > max_len:
        raise ValueError("missing or oversized title/label")
    if model.PRIVATE.search(value) or "<" in value or ">" in value:
        raise ValueError("title/label contains private data or markup")
    return " ".join(value.split())


def public_url(url):
    if not isinstance(url, str) or len(url) > 2048:
        raise ValueError("invalid source URL")
    normalized = model.normalized_url(url)
    parts = urlsplit(normalized)
    if model.PRIVATE.search(normalized) or any(key.lower() not in QUERY_KEYS for key, _ in parse_qsl(parts.query)):
        raise ValueError("use the clean public article URL without query credentials")
    return normalized


def iso_day(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("use an ISO source date (YYYY-MM-DD)")
    return date.fromisoformat(value)


def make_item(title, sources, event_date, country, category, sector, origin):
    if not sources or len(sources) > 12:
        raise ValueError("supply 1–12 source links")
    event_date = iso_day(event_date).isoformat()
    today = datetime.now(timezone.utc).date().isoformat()
    clean = []
    for source in sources:
        url = public_url(source["url"])
        published = iso_day(source["date"]).isoformat()
        if published > today:
            raise ValueError("source publication date is in the future")
        entry = {
            "title": public_text(source["title"]),
            "url": url, "date": published,
            "publisher": public_text(source.get("publisher", urlsplit(url).hostname)),
            "kind": source.get("kind", "independent"),
        }
        if url not in {s["url"] for s in clean}:
            clean.append(entry)
    # The ID never depends on an editable headline, tracking tag, runner or local time.
    candidate_id = "radar-" + hashlib.sha256(clean[0]["url"].encode()).hexdigest()[:24]
    return {"id": candidate_id, "title": public_text(title), "sources": clean, "event_date": event_date,
            "country": public_text(country, 60), "category": public_text(category, 80),
            "sector": public_text(sector, 80), "origin": origin}


def radar_entries(raw):
    if len(raw) > PAYLOAD_LIMIT:
        raise ValueError("export exceeds the intake size limit")
    txt = raw.decode("utf-8-sig").strip()
    fence = re.fullmatch(r"```(?:json)?\s*\n(.*?)\n```", txt, re.IGNORECASE | re.DOTALL)
    value = json.loads(fence.group(1) if fence else txt)
    rows = value if isinstance(value, list) else [value]
    if not rows or len(rows) > 100:
        raise ValueError("export must contain 1–100 objects")
    items = []
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("each export record must be an object")
        if "primary_sources" in row:
            # Discard source assertions, social copy, private notes and approval fields.
            if not isinstance(row["primary_sources"], list):
                raise ValueError("primary_sources must be an array")
            sources = [{k: s[k] for k in ("url", "date", "title")} for s in row["primary_sources"]]
        else:
            sources = [{"url": row["source_url"], "date": row["source_date"], "title": row["title"]}]
        if not sources:
            raise ValueError("at least one public source required")
        items.append(make_item(row["title"], sources, row.get("event_date", sources[0]["date"]),
                               row.get("country", "A verificar"), row.get("category", "Em triagem"),
                               row.get("sector", "Multissetorial"), "radar"))
    return items


class FeedTree(ET.TreeBuilder):
    def doctype(self, name, pubid, system):
        raise ValueError("feed XML must omit DTD declarations")


def parse_feed(feed, body, today):
    if len(body) > PAYLOAD_LIMIT:
        raise ValueError("oversized feed")
    if feed["format"] == "ibge":
        source = json.loads(body)["items"]
        # The official API still emits http article permalinks. Upgrade this known host only.
        fields = [(i["titulo"], i["link"], datetime.strptime(i["data_publicacao"], "%d/%m/%Y %H:%M:%S").date())
                  for i in source]
    elif feed["format"] == "xml":
        doc = ET.fromstring(body, parser=ET.XMLParser(target=FeedTree()))
        root = doc.tag.rsplit("}", 1)[-1]
        if root not in ("rss", "RDF", "feed"):
            raise ValueError("response is not RSS or Atom")
        fields = []
        elements = doc.findall("{*}entry") if root == "feed" else doc.findall(".//{*}item")
        for e in elements[:100]:
            link = next((l for l in e.findall("{*}link") if l.get("rel", "alternate") == "alternate"), None)
            stamp = e.findtext("{*}pubDate") or e.findtext("{*}published") or e.findtext("{*}date") or e.findtext("{*}updated")
            if link is None or not stamp:
                raise ValueError("entry lacks a permalink or date")
            if stamp[:4].isdigit():
                day = datetime.fromisoformat(stamp.replace("Z", "+00:00")).date()
            else:
                day = parsedate_to_datetime(stamp).date()
            fields.append((e.findtext("{*}title"), link.get("href") or link.text, day))
    else:
        raise ValueError("unsupported feed type")
    items = []
    for title, url, day in fields:
        if day > today + timedelta(days=1):
            raise ValueError("future feed timestamp")
        if day > today or (today - day).days > 7:
            continue
        if urlsplit(url).hostname != feed["host"]:
            raise ValueError("entry URL is outside the configured publisher")
        if feed["format"] == "ibge" and url.startswith("http://"):
            url = "https://" + url[len("http://"):]
        source = {"url": url, "date": day.isoformat(), "title": title, "publisher": feed["publisher"], "kind": "primary"}
        items.append(make_item(title, [source], day.isoformat(), feed["country"], feed["category"], feed["sector"], feed["id"]))
    return items


class PublisherRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urlsplit(newurl).scheme != "https" or urlsplit(newurl).netloc != urlsplit(req.full_url).netloc:
            raise ValueError("publisher redirect outside configured host; inspect feed configuration")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download(feed, validators):
    headers = {"User-Agent": "Vertice-Intelligence/1.0 (+https://verticelabs.me/observatorio/)",
               "Accept": "application/rss+xml, application/atom+xml, application/json, text/xml"}
    for name, conditional in (("ETag", "If-None-Match"), ("Last-Modified", "If-Modified-Since")):
        if validators.get(name):
            headers[conditional] = validators[name]
    try:
        with build_opener(PublisherRedirect()).open(Request(feed["url"], headers=headers), timeout=15) as response:
            if response.status != 200:
                raise ValueError(f"unexpected HTTP {response.status}")
            body = response.read(PAYLOAD_LIMIT + 1)
            if len(body) > PAYLOAD_LIMIT:
                raise ValueError("oversized response")
            fresh = {k: response.headers[k] for k in ("ETag", "Last-Modified") if response.headers.get(k)}
            return body, fresh
    except HTTPError as e:
        if e.code == 304 and validators:
            return None, validators
        raise


def add_items(state, items):
    before = len(state["candidates"])
    for item in items:
        state["candidates"].setdefault(item["id"], item)
    return len(state["candidates"]) - before


def collect(state, feeds, fetch=download):
    errors = []
    for feed in feeds:
        try:
            key = feed["url"]
            body, fresh = fetch(feed, state["validators"].get(key, {}))
            if body is None:
                print(f'{feed["id"]}: 304')
                continue
            items = parse_feed(feed, body, datetime.now(timezone.utc).date())
            count = add_items(state, items)
            state["validators"][key] = fresh
            print(f'{feed["id"]}: {len(items)} recent, {count} new')
        except (ValueError, KeyError, TypeError, AttributeError, ET.ParseError, OSError, URLError) as e:
            errors.append(feed["id"])
            print(f'{feed["id"]}: {type(e).__name__}: {e}', file=sys.stderr)
    return errors


@contextmanager
def state_lock(path):
    """Kernel lock releases on process exit, including on interrupted Actions runners."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.with_suffix(path.suffix + ".lock").open("a+b") as handle:
        if os.name == "nt":
            import msvcrt
            if handle.tell() == 0:
                handle.write(b"0")
                handle.flush()
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        yield


def write_json(path, value):
    data = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == data:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, encoding="utf-8", delete=False) as f:
        tmp = Path(f.name)
        try:
            f.write(data)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise
    try:
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def promote(item, directory):
    # Feed timestamps are proposal dates. Editors must establish the actual event date.
    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    entry = {k: v for k, v in item.items() if k != "origin"}
    entry.update({"schema_version": 1, "slug": item["id"], "content_status": "candidate",
                  "history": [{"at": now, "status": "candidate",
                               "note": "Entrada em triagem. Conferir a data do evento e as alegações na fonte."}]})
    if entry["event_date"] > now[:10]:
        entry["event_type"] = "forecast"
        entry["history"][0]["note"] += " Data futura informada pelo radar, sujeita a confirmação."
    model.validate(entry)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / (item["id"] + ".json")
    with state_lock(directory.parent / ("." + directory.name + "-intake")):
        existing = model.load_records(directory)
        for record in existing:
            if record["id"] == item["id"] or public_url(record["sources"][0]["url"]) == item["sources"][0]["url"]:
                return record["slug"]
        if path.exists():
            raise ValueError("candidate filename is occupied by a different record")
        write_json(path, entry)
    return entry["slug"]


def main(argv=None):
    cli = argparse.ArgumentParser(description=__doc__)
    actions = cli.add_subparsers(dest="action", required=True)
    get = actions.add_parser("collect")
    get.add_argument("--feeds", type=Path, default=FEEDS)
    receive = actions.add_parser("import")
    receive.add_argument("file", type=Path)
    take = actions.add_parser("promote")
    take.add_argument("candidate_id")
    take.add_argument("--records", type=Path, default=HERE / "records")
    for cmd in (get, receive, take):
        cmd.add_argument("--state", type=Path, required=True)
    args = cli.parse_args(argv)
    with state_lock(args.state):
        state = json.loads(args.state.read_text(encoding="utf-8")) if args.state.exists() else {
            "version": 1, "candidates": {}, "validators": {}}
        if state.get("version") != 1 or not all(isinstance(state.get(k), dict) for k in ("candidates", "validators")):
            raise ValueError("unknown intake state format")
        if args.action == "promote":
            print(promote(state["candidates"][args.candidate_id], args.records))
            return 0
        if args.action == "import":
            with args.file.open("rb") as f:
                items = radar_entries(f.read(PAYLOAD_LIMIT + 1))
            print(f"Radar: {add_items(state, items)} new")
            errors = []
        else:
            feeds = json.loads(args.feeds.read_text(encoding="utf-8"))
            errors = collect(state, feeds)
        write_json(args.state, state)
        print(f'{len(state["candidates"])} candidates; state {args.state}')
        return int(bool(errors))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError) as error:
        sys.exit(f"Intake: {error}")
