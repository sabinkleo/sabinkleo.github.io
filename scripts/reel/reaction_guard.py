"""Validate cataloged reactions and record approved Reel exports."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

DEFAULT_ASSETS = Path(__file__).resolve().parent / "out" / "assets"


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def reactions(assets, clips):
    catalog = load(assets / "memes" / "catalog.json")
    selected = []
    for clip in clips:
        sha = digest(clip)
        entry = catalog.get(sha)
        if not isinstance(entry, dict) or any(
            not isinstance(entry.get(key), str) or not entry[key].strip()
            for key in ("source_id", "source_url", "rights", "category")
        ):
            raise ValueError(f"Unregistered reaction or incomplete provenance: {clip.name}")
        selected.append({"source_id": entry["source_id"], "sha256": sha})
    return selected


def reject_reuse(history, selected):
    recent = [clip for export in history[-5:] for clip in export["reactions"]]
    for key in ("source_id", "sha256"):
        forbidden = {clip[key] for clip in recent}
        seen = set()
        for clip in selected:
            value = clip[key]
            if value in forbidden or value in seen:
                raise ValueError(f"Reaction already used in this cut or a recent approved Reel: {value}")
            seen.add(value)


def save(path, history):
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as temp:
        temporary = Path(temp.name)
        try:
            json.dump(history, temp, indent=2)
            temp.write("\n")
            temp.flush()
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=os.environ.get("REEL_ASSETS", DEFAULT_ASSETS))
    sub = parser.add_subparsers(dest="action", required=True)
    check = sub.add_parser("check")
    check.add_argument("clips", type=Path, nargs="+")
    approve = sub.add_parser("approve")
    approve.add_argument("export", type=Path)
    approve.add_argument("clips", type=Path, nargs="*")
    args = parser.parse_args()

    try:
        assets = args.assets
        assets.mkdir(parents=True, exist_ok=True)
        path = assets / "used_memes.json"
        selected = reactions(assets, args.clips) if args.clips else []
        with (assets / "used_memes.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            history = load(path) if path.exists() else []
            if args.action == "check":
                reject_reuse(history, selected)
                return
            export_sha = digest(args.export)
            previous = next((item for item in history if item["sha256"] == export_sha), None)
            if previous is not None:
                if previous["reactions"] != selected:
                    raise ValueError("This export was already approved with a different reaction list")
                return
            reject_reuse(history, selected)
            save(path, [*history, {"sha256": export_sha, "reactions": selected}])
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        parser.exit(1, f"Reaction guard: {error}\n")


if __name__ == "__main__":
    main()
