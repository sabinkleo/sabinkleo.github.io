"""Maintain the engineering lab's public guided experiments. Python standard library only."""
import argparse
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
PUBLISHED = ROOT / "src/data/lab-guides.json"
PROJECTS = {
    "routing": ("Inference failover", "src/components/lab/router.ts", "src/pages/en/lab.astro"),
    "dyno": ("Dyno replay", "src/components/lab/dyno.ts", "src/pages/en/lab.astro"),
}
FIELDS = ("question", "action", "observe")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


for slug in ("ai-ops", "linux-security", "auto-telemetry"):
    PROJECTS[slug] = (slug + " readiness diagnostic", "src/data/diagnostics/" + slug + ".ts", "src/components/DiagnosticTerminal.ts")


def evidence(project):
    title, component, page = PROJECTS[project]
    ui = (ROOT / page).read_text(encoding="utf-8")
    if project in ("routing", "dyno"):
        start = ui.index('<section aria-labelledby="' + ("routing-title" if project == "routing" else "dyno-title") + '"')
        snippet = ui[start:ui.index("</section>", start)]
    else:
        snippet = ui
    code = (ROOT / component).read_text(encoding="utf-8")
    # Ignore checkout-specific line endings. Only public, fixed source files enter the prompt.
    content = code + "\n" + snippet
    return title, content, hashlib.sha256(content.encode()).hexdigest()


def read_guides():
    if not PUBLISHED.exists():
        return {}
    return json.loads(PUBLISHED.read_text(encoding="utf-8"))


def validate(obj):
    if not isinstance(obj, dict) or set(obj) != set(FIELDS):
        raise ValueError("Expected question, action and observe")
    for field in FIELDS:
        if not isinstance(obj[field], str) or not 8 <= len(obj[field].strip()) <= 420:
            raise ValueError("Invalid guide field: " + field)
    return {f: obj[f].strip() for f in FIELDS}


def atomic(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(text)
    os.replace(handle.name, path)


def generate(project, model):
    title, source, digest = evidence(project)
    endpoint = os.environ.get("FREELLM_BASE_URL", "http://127.0.0.1:3001/v1").rstrip("/")
    url = urlsplit(endpoint)
    if url.username or url.password or url.query or url.fragment or not (
        url.scheme == "https" or (url.scheme == "http" and url.hostname in {"127.0.0.1","localhost","::1"})
    ):
        raise ValueError("Use a trusted HTTPS gateway or loopback URL.")
    token = os.environ.get("FREELLM_API_KEY")
    if not token:
        raise ValueError("Missing FREELLM_API_KEY")
    prompt = ("Write one short English guided experiment for the " + title +
              " browser simulator. Use only controls and effects visible in the supplied source. "
              "No physical equipment advice, code, invented results or provider claims. "
              "For diagnostics, guide the visitor in interpreting their score and choosing an evidence check. "
              "Return one JSON object containing exactly three strings: question, action, observe. "
              "Use at most 35 words per field, no Markdown.\n\n" + source)
    body = {"model": model, "messages": [{"role":"user","content":prompt}], "max_tokens":850, "reasoning_effort":"low"}
    req = Request(endpoint + "/chat/completions", data=json.dumps(body).encode(),
                  headers={"Authorization":"Bearer " + token, "Content-Type":"application/json"})
    with build_opener(NoRedirect()).open(req, timeout=90) as response:
        data = json.loads(response.read(100_000))
    content = data["choices"][0]["message"]["content"].strip()
    if content.startswith("```") and content.endswith("```"):
        content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return {"source_sha256":digest, "model":str(data["model"])[:150], **validate(json.loads(content))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--level", type=int, choices=(1,2,3), required=True)
    parser.add_argument("--project", choices=(*PROJECTS,"all"), default="all")
    parser.add_argument("--model", default=os.environ.get("FREELLM_MODEL","auto"))
    parser.add_argument("--output", type=Path, default=Path("build/engineering"))
    args = parser.parse_args()
    chosen = PROJECTS if args.project == "all" else [args.project]
    guides = read_guides()
    if args.level == 3:
        lines = ["# Astra engineering review", "", "Review the project evidence, reproduce the change and correct the smallest failing case.", ""]
        for project in chosen:
            title, component, page = PROJECTS[project]
            _, _, digest = evidence(project)
            lines += ["## " + title, "", "Inspect `" + component + "` and `" + page + "`.",
                      "Current source fingerprint: `" + digest + "`.",
                      "Published guide fingerprint: `" + guides.get(project,{}).get("source_sha256","missing") + "`.", ""]
        lines += ["Run `npm run build`, then the lab Chromium regression in the V2 build QA workflow.",
                  "Check the proposed guide against the actual controls and simulated output. Review any code changes in a PR."]
        atomic(args.output / "astra-review.md", "\n".join(lines) + "\n")
        print(args.output / "astra-review.md")
        return
    if args.level == 1:
        for project in chosen:
            guide = guides.get(project,{})
            validate({k:guide.get(k) for k in FIELDS})
            if guide.get("source_sha256") != evidence(project)[2]:
                raise ValueError("Stale guide: " + project + ". Regenerate at level 2.")
            print(project + ": evidence and guide match")
        return
    for project in chosen:
        guides[project] = generate(project,args.model)
        print(project + ": generated with " + guides[project]["model"],file=sys.stderr)
    target = args.output / "lab-guides.json"
    atomic(target,json.dumps(guides,ensure_ascii=False,indent=2) + "\n")
    print(target)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, IndexError, AttributeError, URLError, OSError) as exc:
        sys.exit("Engineering update failed: " + str(exc) + ". Use --level 3 to prepare review.")
