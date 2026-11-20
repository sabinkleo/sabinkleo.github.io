"""Build a complete review bundle in isolation before offering any site files to Git."""
import argparse
import hashlib
import json
import tempfile
import re
from datetime import date
from pathlib import Path
from shutil import copytree
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = {"approved", "published", "updated"}
MANIFEST = "edicoes.json"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def fingerprint(record):
    # Invalidate the media QA receipt when any relevant rendering or verification code changes.
    digest = hashlib.sha256(json.dumps(record, ensure_ascii=False, sort_keys=True).encode())
    for name in ("pipeline.py", "sitegen.py", "media.py", "distribution.py", "model.py",
                 "requirements.txt", "schema.json", "config.json"):
        digest.update((ROOT / "editorial" / name).read_bytes())
    return digest.hexdigest()


def fallback(records):
    if not records:
        return "Nenhuma edição validada disponível para preparar um guia educativo.\n"
    r = max(records, key=lambda x: (x["verified_at"], x["id"]))
    steps = "\n".join(f"{i}. {s}" for i, s in enumerate(r["how_to_adapt"], 1))
    return (f"# Guia educativo de arquivo · {r['title']}\n\n"
            f"Releitura da edição sobre o fato de {r['event_date']}.\n\n{r['summary']}\n\n{steps}\n\n"
            f"{r['brazil_note']}\n\n{r['limitations']}\n\nFonte: {r['sources'][0]['url']}\n"
            f"Guia: https://verticelabs.me/observatorio/{r['slug']}/\n")


def run(directory, output, force_media=False):
    from . import distribution, media, model, sitegen

    if output.exists():
        raise ValueError(f"Output already exists. Choose a fresh directory: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    records = model.load_records(directory)
    policy = read_json(ROOT / "editorial/config.json")
    last_path = ROOT / "observatorio" / MANIFEST
    last = read_json(last_path) if last_path.exists() else {}
    evidence = {}
    eligible = []
    for record in records:
        if record["content_status"] not in PUBLIC:
            continue
        if record["event_type"] != "educational" and record["slug"] not in last:
            age = date.fromisoformat(record["published_at"][:10]) - date.fromisoformat(record["event_date"])
            if model.score(record) < policy["min_priority"] or age.days > policy["news_window_days"]:
                continue
        tool = urlsplit(record["related_tool"]).path.strip("/")
        if not (ROOT / tool / "index.html").is_file():
            raise ValueError(f"Related tool missing: {tool}")
        evidence[record['slug']] = model.check_sources(record)
        eligible.append(record)

    versions = {r["slug"]: fingerprint(r) for r in eligible}
    changed = sorted(k for k, v in versions.items() if v != last.get(k))
    rendered = []
    # Expose the complete directory only after every required check has succeeded.
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        stage = Path(tmp) / "review"
        site = stage / "site/observatorio"
        site.mkdir(parents=True)
        for r in eligible:
            slug = r["slug"]
            if slug in changed or force_media:
                pack = stage / "packages" / slug
                pack.mkdir(parents=True)
                media.render(r, pack)
                distribution.export(r, pack)
                rendered.append(slug)
        sitegen.build(eligible, site)
        write_json(site / MANIFEST, versions)
        if not changed:
            (stage / "guia-educativo.md").write_text(fallback(eligible), encoding="utf-8")
        summary = {"accepted": len(eligible), "input": len(records), "changed": changed,
                   "rendered": rendered, "held": len(records) - len(eligible),
                   "scores": {r["slug"]: model.score(r) for r in records if "rubric" in r}}
        write_json(stage / "evidence.json", evidence)
        write_json(stage / "report.json", summary)
        stage.rename(output)
    return summary


def sync_site(source, target):
    # Only remove generated editions previously owned by this publisher.
    old = read_json(target / MANIFEST) if (target / MANIFEST).exists() else {}
    new = read_json(source / MANIFEST)
    for slug in old.keys() - new.keys():
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
            raise ValueError("Invalid previous edition slug")
        page = target / slug / "index.html"
        page.unlink(missing_ok=True)
        if page.parent.is_dir() and not any(page.parent.iterdir()):
            page.parent.rmdir()
    copytree(source, target, dirs_exist_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--records", type=Path, default=ROOT / "editorial/records")
    parser.add_argument("--output", type=Path, required=True, help="New review directory")
    parser.add_argument("--force-media", action="store_true", help="Rebuild all packages for review")
    parser.add_argument("--stage-site", action="store_true", help="Copy validated static outputs into this checkout")
    args = parser.parse_args()
    report = run(args.records, args.output, args.force_media)
    if args.stage_site:
        sync_site(args.output / "site/observatorio", ROOT / "observatorio")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
