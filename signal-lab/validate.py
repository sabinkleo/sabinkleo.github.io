#!/usr/bin/env python3
"""Verify the PUBLIC Drops catalog has no internal strategy feed. Stdlib-only."""
from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
DROP = ROOT / "drops"
CHECKED = {"all", "dev", "education", "cloud", "ai"}
FIELDS = {
    "id", "name", "provider", "category", "type", "headline", "description",
    "eligibility", "conditions", "starts_at", "expires_at", "verified_at",
    "cta", "url", "source_url", "coupon_code", "featured",
}

class Parser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.scripts: list[str] = []
    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        d = dict(attrs)
        if d.get("id"):
            self.ids.append(d["id"])
        if tag == "script" and d.get("src"):
            self.scripts.append(d["src"])

def test() -> int:
    errors: list[str] = []
    if (ROOT / "signal-lab" / "signals.json").exists():
        errors.append("Private research manifest is still publicly served!")
    if (ROOT / "signal-lab" / "app.js").exists():
        errors.append("Old Signal Lab app is still publicly served!")
    page = (ROOT / "signal-lab" / "index.html").read_text(encoding="utf-8")
    if 'url=/drops/' not in page or 'noindex' not in page:
        errors.append("Old Signal Lab route must redirect to Drops and noindex")
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    if 'href="/drops/"' not in home:
        errors.append("Homepage must link to public Drops")
    p = Parser()
    p.feed((DROP / "index.html").read_text(encoding="utf-8"))
    if len(p.ids) != len(set(p.ids)):
        errors.append("Duplicate HTML IDs")
    if p.scripts != ["./app.js"]:
        errors.append("Drops page may only load the local app.js")
    for need in ("count", "checked", "notice", "offers", "empty"):
        if need not in p.ids:
            errors.append(f"Missing #{need}")
    try:
        data = json.loads((DROP / "offers.json").read_text(encoding="utf-8"))
        assert data.get("schema_version") == 1
        assert isinstance(data.get("offers"), list)
        ids: set[str] = set()
        for i, o in enumerate(data["offers"]):
            if not isinstance(o, dict) or (FIELDS - set(o)):
                errors.append(f"Offer {i} has missing fields")
                continue
            if not re.fullmatch(r"[a-z][a-z0-9-]{3,60}", o["id"]):
                errors.append(f"Offer {i} malformed ID")
            if o["id"] in ids:
                errors.append(f"Offer {i} duplicate ID")
            ids.add(o["id"])
            if o["category"] not in CHECKED - {"all"}:
                errors.append(f"Offer {i} invalid category")
            if o["type"] not in {"promo", "free", "credits"}:
                errors.append(f"Offer {i} invalid type")
            if o["coupon_code"] is not None:
                errors.append(f"Offer {i} has unverified coupon code")
            for key in ("url", "source_url"):
                parsed = urlparse(str(o[key]))
                if parsed.scheme != "https" or not parsed.netloc:
                    errors.append(f"Offer {i} needs official HTTPS {key}")
            for datekey in ("starts_at", "expires_at", "verified_at"):
                val = o.get(datekey)
                if val is not None and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(val)):
                    errors.append(f"Offer {i} invalid date {datekey}")
            if o["starts_at"] and o["expires_at"] and o["expires_at"] < o["starts_at"]:
                errors.append(f"Offer {i} ends before it begins")
            for field in ("name", "provider", "headline", "description", "eligibility", "conditions", "cta"):
                if not isinstance(o.get(field), str) or not o[field].strip():
                    errors.append(f"Offer {i} empty {field}")
    except (OSError, ValueError, AssertionError, TypeError) as exc:
        errors.append(f"Invalid public offer manifest: {exc}")
    for error in errors:
        print("ERROR:", error, file=sys.stderr)
    if errors:
        return 1
    print(f"PASS: verified-only public offers, URL validation, redirects and no public competitor manifest ({len(ids)} benefits).")
    return 0

if __name__ == "__main__":
    raise SystemExit(test())
