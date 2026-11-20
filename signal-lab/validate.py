#!/usr/bin/env python3
"""Validate Signal Lab's public editorial dataset and single-page app structure.

Usage: python signal-lab/validate.py
No API keys, network calls or third-party dependencies.
"""
from __future__ import annotations

import json
import math
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
FIELDS = {
    "id", "title", "maker", "category", "phase", "evidence",
    "model", "claim", "verified", "mechanism", "test", "risks",
    "why", "source", "url", "potential", "speed", "cash",
    "repeat", "proof", "score", "priority", "tag", "creative", "validation",
}
CATEGORIES = {"compliance", "distribution", "automation", "acquisition", "infra", "research"}
PHASES = {"agir", "testar", "validar", "observar", "descartar"}
EVIDENCE = {"oficial", "interno", "parcial", "anuncio"}
FACTORS = ["potential", "speed", "cash", "repeat", "proof"]
WEIGHTS = [0.30, 0.25, 0.20, 0.15, 0.10]


class IDs(HTMLParser):
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


def validate() -> int:
    errors: list[str] = []
    try:
        payload = json.loads((HERE / "signals.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print("ERROR: cannot read signals.json:", exc, file=sys.stderr)
        return 1

    if payload.get("schema_version") != 1:
        errors.append("schema_version must be 1")
    if not re.fullmatch(r"\d{4}-\d\d-\d\d", str(payload.get("updated_at", ""))):
        errors.append("updated_at must be YYYY-MM-DD")
    items = payload.get("signals")
    if not isinstance(items, list) or not items:
        errors.append("signals must be a non-empty list")
        items = []
    seen: set[str] = set()
    for i, item in enumerate(items):
        p = f"signals[{i}]"
        if not isinstance(item, dict):
            errors.append(f"{p}: not an object")
            continue
        for missing in FIELDS - item.keys():
            errors.append(f"{p}: missing {missing}")
        identifier = item.get("id", "")
        if not isinstance(identifier, str) or not re.fullmatch(r"[a-z][a-z0-9-]{2,39}", identifier):
            errors.append(f"{p}: invalid id")
        elif identifier in seen:
            errors.append(f"{p}: duplicate id {identifier}")
        seen.add(identifier)
        if item.get("category") not in CATEGORIES:
            errors.append(f"{p}: bad category")
        if item.get("phase") not in PHASES:
            errors.append(f"{p}: bad phase")
        if item.get("evidence") not in EVIDENCE:
            errors.append(f"{p}: bad evidence")
        source = item.get("url")
        if not isinstance(source, str) or urlsplit(source).scheme != "https" or not urlsplit(source).netloc:
            errors.append(f"{p}: source URL must be HTTPS")
        if item.get("verified") is not None and not re.fullmatch(r"\d{4}-\d\d-\d\d", str(item["verified"])):
            errors.append(f"{p}: invalid verified date")
        for field in ["title", "maker", "model", "claim", "mechanism", "test", "risks", "why", "source"]:
            if not isinstance(item.get(field), str) or not item[field].strip():
                errors.append(f"{p}: empty text {field}")
        creative = item.get("creative")
        if not isinstance(creative, dict) or set(creative) != {"hook", "demo", "result", "cta"}:
            errors.append(f"{p}: expected creative hook/demo/result/cta")
        elif any(not isinstance(v, str) or not v.strip() for v in creative.values()):
            errors.append(f"{p}: empty creative field")
        if item.get("validation") != "hipotese_sem_venda_confirmada":
            errors.append(f"{p}: must distinguish commercial validation from source verification")
        values = [item.get(f) for f in FACTORS]
        if all(type(v) is int and 1 <= v <= 5 for v in values):
            expected = math.floor(20 * sum(w * v for w, v in zip(WEIGHTS, values)) + 0.5)
            if item.get("score") != expected:
                errors.append(f"{p}: score should be {expected}, not {item.get('score')}")
        else:
            errors.append(f"{p}: factors must be integers 1..5")

    p = IDs()
    p.feed((HERE / "index.html").read_text(encoding="utf-8"))
    if len(set(p.ids)) != len(p.ids):
        errors.append("duplicate HTML ids")
    for required in ["cards", "search", "filters", "sort", "phase", "savedOnly", "suggest", "perHour", "export"]:
        if required not in p.ids:
            errors.append(f"HTML missing #{required}")
    if p.scripts != ["./app.js"]:
        errors.append("Expected exactly one local JS script, no ad pixels or third-party scripts")
    if not (HERE / "app.js").is_file():
        errors.append("Missing app.js")

    for error in errors:
        print("ERROR:", error, file=sys.stderr)
    if errors:
        return 1
    print(f"PASS: {len(items)} signals, unique IDs, dates, HTTPS sources, editorial score formula, HTML and local JS linkage.")
    return 0


if __name__ == "__main__":
    raise SystemExit(validate())
