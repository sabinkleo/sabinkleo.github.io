"""Validate versioned editorial records before any renderer or distributor receives them."""

import hashlib
import json
import re
import unicodedata
from datetime import date, datetime, timezone
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from jsonschema import Draft202012Validator, FormatChecker

HERE = Path(__file__).resolve().parent
CONFIG = json.loads((HERE / "config.json").read_text(encoding="utf-8"))
SCHEMA = json.loads((HERE / "schema.json").read_text(encoding="utf-8"))
VALIDATOR = Draft202012Validator(SCHEMA, format_checker=FormatChecker())
STATES = ("candidate", "verified", "draft", "approved", "published", "updated")
PUBLIC = frozenset(STATES[3:])
MAX_SOURCE_BYTES = 4 * 1024 * 1024
HOST = re.compile(r"(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$")
PRIVATE = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|"
    r"AKIA[A-Z0-9]{16}|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{32,})\b|"
    r"\b(?:api[_ -]?key|senha|password|client[_ -]?secret|access[_ -]?token)\s*[:=]\s*\S{4,}|"
    r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|"
    r"(?<!\w)(?:\+55\s*)?\(\d{2}\)\s*9?\d{4}[\s-]?\d{4}\b", re.I
)
HIGH_RISK = re.compile(r"\b(?:tribut[oa]s?|impostos?|fiscais|legisla[cç][aã]o|regula[cç][aã]o|regulamenta[cç][aã]o|leis?|sa[uú]de|m[eé]dico|m[eé]dica|prescri[cç][aã]o|diagn[oó]stico cl[ií]nico|ICMS|IPVA|IRPF|LGPD)\b", re.I)


def _instant(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("timestamp requires a UTC offset")
    return result.astimezone(timezone.utc)


def normalized_url(url):
    """Preserve meaningful query parameters, stripping fragments and known campaign tags."""
    if url != url.strip() or re.search(r"[\s\\\x00-\x1f]", url):
        raise ValueError("source URL includes whitespace, controls or backslash")
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if (parts.scheme.lower() != "https" or parts.username is not None or parts.password is not None
            or parts.port not in (None, 443) or not HOST.fullmatch(host)
            or host.endswith((".local", ".localhost", ".internal", ".test", ".invalid", ".onion"))):
        raise ValueError("source URL must use a public HTTPS hostname with no credentials")
    pairs = parse_qsl(parts.query, keep_blank_values=True, max_num_fields=100)
    if any(k.lower() in ("token", "access_token", "api_key", "apikey", "password", "signature") for k, _ in pairs):
        raise ValueError("source URL contains a credential parameter")
    kept = sorted((k, v) for k, v in pairs if not k.lower().startswith("utm_") and k.lower() not in ("fbclid", "gclid"))
    return urlunsplit(("https", host, parts.path.rstrip("/") or "/", urlencode(kept), ""))


def source_owner(url):
    host = urlsplit(normalized_url(url)).hostname
    try:
        return CONFIG["source_hosts"][host]
    except KeyError as exc:
        raise ValueError(f"unreviewed source hostname: {host}") from exc


def score(record):
    weights = CONFIG["weights"]
    if set(weights) != set(SCHEMA["properties"]["rubric"]["required"]) or any(type(w) is not int or w < 0 for w in weights.values()) or sum(weights.values()) != 100:
        raise ValueError("rubric weights must be nonnegative integers totaling 100")
    values = record.get("rubric", {})
    if set(values) != set(weights) or any(type(v) is not int or not 0 <= v <= 5 for v in values.values()):
        raise ValueError("rubric needs five integer ratings from 0 to 5")
    return (sum(weights[key] * value for key, value in values.items()) + 2) // 5


def _strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for field in value.values():
            yield from _strings(field)
    elif isinstance(value, list):
        for field in value:
            yield from _strings(field)


def _words(text):
    return re.findall(r"[^\W_]+", unicodedata.normalize("NFKC", text).casefold())


def _check_history(record, now):
    history = record["history"]
    stages = [e["status"] for e in history]
    target = STATES.index(record["content_status"]) + 1
    if stages != list(STATES[:target]) + ["updated"] * max(0, len(stages) - len(STATES)):
        raise ValueError("invalid editorial transition or missing history")
    times = [_instant(entry["at"]) for entry in history]
    if times != sorted(times) or times[-1] > now:
        raise ValueError("history must be chronological and cannot be in the future")
    if record.get("updated_at") and times[-1] != _instant(record["updated_at"]):
        raise ValueError("updated_at must match the last recorded transition")
    if target >= 2 and not times[1] <= _instant(record["verified_at"]) <= times[-1]:
        raise ValueError("verified_at is outside recorded verification history")
    if record.get("published_at") and not times[0] <= _instant(record["published_at"]) <= times[-1]:
        raise ValueError("edition date is outside recorded history")
    return times


def validate(record):
    error = next(VALIDATOR.iter_errors(record), None)
    if error is not None:
        path = ".".join(str(part) for part in error.absolute_path) or "record"
        # An error may involve private input. Never send the offending value to CI logs.
        raise ValueError(f"{path}: violates schema constraint {error.validator}")
    if any(PRIVATE.search(s) for s in _strings(record)):
        raise ValueError("possible private data or credential in record")
    status = record["content_status"]
    now = datetime.now(timezone.utc)
    times = _check_history(record, now)
    verified = _instant(record["verified_at"]) if record.get("verified_at") else None
    if date.fromisoformat(record["event_date"]) > (verified or now).date() and record.get("event_type") != "forecast":
        raise ValueError("future event requires forecast classification")
    urls, owners = set(), set()
    for source in record["sources"]:
        url = normalized_url(source["url"])
        if url in urls:
            raise ValueError("duplicate source URL within record")
        urls.add(url)
        if date.fromisoformat(source["date"]) > (verified or now).date():
            raise ValueError("source dated after verification")
        if status != "candidate":
            owners.add(source_owner(url))
            if not 4 <= len(_words(source["anchor"])) <= 22:
                raise ValueError("source anchor must contain 4–22 exact words")
    publishers = {" ".join(_words(s["publisher"])) for s in record["sources"]}
    if status != "candidate" and not any(s["kind"] == "primary" for s in record["sources"]) and min(len(owners), len(publishers)) < 2:
        raise ValueError("need a primary source or two independent source owners")
    if "rubric" in record:
        score(record)
    if status not in PUBLIC:
        return
    if len(set(record["how_to_adapt"])) != 3:
        raise ValueError("the three adaptation steps must be distinct")
    if record["related_tool"] not in CONFIG["related_tools"]:
        raise ValueError("related tool must be an approved site route")
    for field, state, source in (("brazil_status", "confirmed", "brazil_source"), ("opportunity_status", "evidenced", "demand_source")):
        if record[field] == state and normalized_url(record.get(source, "")) not in urls:
            raise ValueError(f"{field} needs a checked source in {source}")
    review = record["review"]
    if record["brazil_status"] == "confirmed" and review.get("br_scope") is not True:
        raise ValueError("explicit review of Brazilian availability required")
    # Flag explicit assertions even if an editor accidentally leaves the location unconfirmed.
    public_text = " ".join(_strings({k: record[k] for k in ("title", "summary", "what_changed", "brazil_note", "social_package")}))
    if record["brazil_status"] == "unconfirmed" and re.search(r"(?<!não )(?<!não está )\b(?:disponível|liberado|lançado|funciona) (?:já )?(?:em todo o |no )Brasil\b", public_text, re.I):
        raise ValueError("Brazil availability claim conflicts with unconfirmed classification")
    if record["risk"] != "standard" or HIGH_RISK.search(" ".join(_strings({k: record[k] for k in ("title","category","summary","what_changed","how_to_adapt","social_package")}))):
        if not (review.get("human") is True and review.get("specialist", "").strip() and review.get("specialty", "").strip() and review.get("reviewed_at")):
            raise ValueError("sensitive topic requires a named human specialist, scope and review timestamp")
        if not _instant(record["verified_at"]) <= _instant(review["reviewed_at"]) <= times[-1]:
            raise ValueError("specialist review timestamp is outside the verified edition")


def load_records(directory=HERE / "records"):
    directory = Path(directory)
    if not directory.is_dir():
        raise ValueError("record directory is missing")
    seen_ids, seen_slugs, seen_events, records = set(), set(), set(), []
    for path in sorted(directory.glob("*.json")):
        if path.stat().st_size > 300_000:
            raise ValueError(f"{path.name}: editorial record exceeds size limit")
        try:
            record = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_unique_keys)
            validate(record)
            lead = record["sources"][0]
            event = (normalized_url(lead["url"]), record["event_date"])
            if record["id"] in seen_ids or record["slug"] in seen_slugs or event in seen_events:
                raise ValueError("duplicate id, slug or dated source event")
            seen_ids.add(record["id"])
            seen_slugs.add(record["slug"])
            seen_events.add(event)
            records.append(record)
        except (ValueError, KeyError, TypeError) as exc:
            raise ValueError(f"{path.name}: {exc}") from exc
    return records


def _unique_keys(pairs):
    data = {}
    for key, value in pairs:
        if key in data:
            raise ValueError("duplicate JSON key")
        data[key] = value
    return data


@dataclass(frozen=True)
class SourceDocument:
    text: str
    dates: tuple


def _date_present(value, document):
    # Official international and Brazilian feeds commonly render dates in these forms.
    day = date.fromisoformat(value)
    months = (
        ("january", "janeiro"), ("february", "fevereiro"), ("march", "março"), ("april", "abril"),
        ("may", "maio"), ("june", "junho"), ("july", "julho"), ("august", "agosto"),
        ("september", "setembro"), ("october", "outubro"), ("november", "novembro"), ("december", "dezembro"),
    )
    forms = {value, f"{day.day:02}/{day.month:02}/{day.year}", f"{day.month:02}/{day.day:02}/{day.year}"}
    for month in months[day.month - 1]:
        for name in (month, month[:3]):
            forms.update((f"{name} {day.day}, {day.year}", f"{day.day} {name} {day.year}",
                          f"{day.day} de {name} de {day.year}", f"{name} {day.day} {day.year}"))
    prose = " " + " ".join(_words(document.text)) + " "
    return any(item[:10] == value for item in document.dates) or any(" " + " ".join(_words(f)) + " " in prose for f in forms)


class _PublicText(HTMLParser):
    ignored = {"script", "style", "head", "template", "nav", "footer", "noscript", "svg"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.dates = []
        self.skip = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "time" and self.skip is None and attributes.get("datetime"):
            self.dates.append(attributes["datetime"])
        if tag == "meta" and self.skip in (None, "head"):
            date_type = attributes.get("property") or attributes.get("itemprop") or attributes.get("name")
            if date_type in ("article:published_time", "datePublished", "publish-date") and attributes.get("content"):
                self.dates.append(attributes["content"])
        if self.skip is None and tag in self.ignored:
            self.skip = tag

    def handle_endtag(self, tag):
        if tag == self.skip:
            self.skip = None

    def handle_data(self, data):
        if self.skip is None:
            self.parts.append(data)


class _SourceRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if source_owner(newurl) != source_owner(req.full_url):
            raise ValueError("source redirected to a different editorial owner")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _source_text(url):
    source_owner(url)
    req = Request(url, headers={"User-Agent": "VerticeIntelligence/1.0 (+https://verticelabs.me/observatorio/)", "Accept": "text/html, text/plain"})
    with build_opener(_SourceRedirect()).open(req, timeout=20) as response:
        source_owner(response.geturl())
        kind = response.headers.get_content_type()
        if response.status != 200 or kind not in {"text/html", "application/xhtml+xml", "text/plain"}:
            raise ValueError("source did not return a text document and HTTP 200")
        data = response.read(MAX_SOURCE_BYTES + 1)
        if len(data) > MAX_SOURCE_BYTES:
            raise ValueError("source exceeds download budget")
        content = data.decode(response.headers.get_content_charset("utf-8"))
    if kind == "text/plain":
        return SourceDocument(content, ())
    parser = _PublicText()
    parser.feed(content)
    parser.close()
    return SourceDocument(" ".join(parser.parts), tuple(parser.dates))


def check_sources(record):
    """Check exact evidence on the live source. Editorial review establishes semantic support."""
    validate(record)
    if record["content_status"] == "candidate":
        raise ValueError("candidate needs editorial verification before it can be released")
    public_fields = ("summary", "what_changed", "who_is_affected", "how_to_adapt", "limitations", "brazil_note", "business_opportunity", "social_package")
    snippets = set()
    for field in public_fields:
        for text in _strings(record.get(field)):
            words = _words(text)
            snippets.update(tuple(words[i:i + 26]) for i in range(len(words) - 25))
    receipts = []
    for source in record["sources"]:
        url = normalized_url(source["url"])
        body = _source_text(url)
        words = _words(body.text)
        if not _date_present(source["date"], body):
            raise ValueError(f"{record['slug']}: source date is absent from {url}")
        if " " + " ".join(_words(source["anchor"])) + " " not in " " + " ".join(words) + " ":
            raise ValueError(f"{record['slug']}: declared evidence is absent from {url}")
        if any(tuple(words[i:i + 26]) in snippets for i in range(len(words) - 25)):
            raise ValueError(f"{record['slug']}: review extended verbatim source material")
        receipts.append({"url": url, "anchor_sha256": hashlib.sha256(source["anchor"].encode()).hexdigest()})
    return receipts
