"""Cross-check a PR against its base, including edits to already reviewed articles."""
import argparse
import json
import subprocess
from datetime import datetime
from pathlib import Path

from .pipeline import PUBLIC, ROOT


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True)


def verify_revision(old, new):
    if old["content_status"] not in PUBLIC or old == new:
        return
    if new.get("id") != old["id"] or new.get("slug") != old["slug"]:
        raise ValueError("Preserve the existing edition ID and permanent URL")
    if new.get("published_at") != old["published_at"]:
        raise ValueError("Preserve the original edition date")
    history = old["history"]
    if (len(new["history"]) <= len(history) or new["history"][:len(history)] != history
            or datetime.fromisoformat(new["updated_at"]) <= datetime.fromisoformat(old["updated_at"])):
        raise ValueError("Append a dated editorial history entry when changing a reviewed edition")


def generated_paths(root):
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob("*")
            if p.is_file()}


def check(base, review):
    delta = git("diff", "--no-renames", "--name-only", f"{base}...HEAD").splitlines()
    for path in delta:
        if not (path.startswith("editorial/records/") and path.endswith(".json")):
            continue
        if subprocess.run(["git", "cat-file", "-e", f"{base}:{path}"], cwd=ROOT,
                          stderr=subprocess.DEVNULL).returncode == 0 and (ROOT / path).exists():
            verify_revision(json.loads(git("show", f"{base}:{path}")),
                            json.loads((ROOT / path).read_text(encoding="utf-8")))
    # Record-only PRs may enter the editorial queue before generated pages are proposed.
    reviewed = any(p.startswith("observatorio/") and not p.startswith("observatorio/assets/") for p in delta)
    if reviewed:
        local = generated_paths(ROOT / "observatorio")
        expected = generated_paths(review / "site/observatorio")
        mismatch = sorted(p for p in local.keys() | expected.keys() if local.get(p) != expected.get(p))
        if mismatch:
            raise ValueError("Public files differ from the validated build: " + ", ".join(mismatch))
    return reviewed


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base")
    parser.add_argument("review", type=Path)
    args = parser.parse_args()
    print("Checked release files:", check(args.base, args.review))
