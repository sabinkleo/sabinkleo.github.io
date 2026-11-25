"""Render a validated Observatório record into an isolated motion review bundle."""
import argparse
from datetime import date, datetime
from hashlib import file_digest, sha256
import json
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
from textwrap import wrap
from zoneinfo import ZoneInfo

from . import model

RENDERER = Path(__file__).with_name("motion")
FPS = 30
PURPOSES = ("hook", "explanation", "scope", "practical_test", "source_credit")
VISUALS = {
    "loop": "Repeat a query pulse around the schematic circuit.",
    "signal": "Trace the event through the PR, event and JSON nodes.",
    "gate": "Reveal an access gate and hold the waitlist label.",
    "sequence": "Reveal the ordered test steps one at a time.",
    "comparison": "Slide two approved example values into view from opposing sides.",
    "stack": "Reveal layers in priority order.",
    "timeline": "Draw the connection between the event and edition dates.",
    "explain": "Reveal a typographic label and an original illustration in layers.",
    "source": "Slide in publisher and edition credits on the final frame.",
}


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def record_digest(record):
    data = json.dumps(record, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return sha256(data.encode()).hexdigest()


def edition_date(value):
    return datetime.fromisoformat(value).astimezone(ZoneInfo("America/Sao_Paulo")).date().isoformat()


def default_direction(record):
    comparison = record["social_package"].get("comparison")
    result = []
    for i, scene in enumerate(record["social_package"]["reel"]):
        visual = ("comparison" if i < 2 and comparison else
                  {1: "timeline", 4: "source"}.get(i, "explain"))
        result.append([scene["title"], scene["voice"], visual, []])
    return result


def plan_record(record):
    model.validate(record)
    if record["content_status"] not in model.PUBLIC:
        raise ValueError("Motion review requires an approved record")

    direction = json.loads((RENDERER / "directions.json").read_text(encoding="utf-8")).get(record["slug"])
    digest = record_digest(record)
    if direction and direction["record_sha256"] != digest:
        raise ValueError("The record changed. Review and refresh its visual direction before rendering.")

    scenes, start = [], 0
    lengths = (3, 6, 5, 7, 6) if record["event_type"] != "educational" else (3, 5, 8, 8, 6)
    drafts = direction["scenes"] if direction else default_direction(record)
    if len(drafts) != len(PURPOSES):
        raise ValueError("Expected five planned scenes")
    sources = [{key: s[key] for key in ("url", "title", "publisher", "date", "kind")} for s in record["sources"]]
    lead = next((s for s in sources if s["kind"] == "primary"), sources[0])
    comparison = record["social_package"].get("comparison")
    fields_by_purpose = {
        "hook": ["social_package.reel", "summary"],
        "explanation": ["social_package.reel", "what_changed", "event_date"],
        "scope": ["social_package.reel", "limitations", "brazil_note"],
        "practical_test": ["social_package.reel", "how_to_adapt"],
        "source_credit": ["social_package.reel", "sources", "published_at", "how_to_adapt"],
    }
    for seconds, purpose, draft in zip(lengths, PURPOSES, drafts, strict=True):
        title, text, visual, labels = draft
        end = start + seconds * FPS
        fields = fields_by_purpose[purpose]
        if visual == "comparison":
            fields = [*fields, "social_package.comparison"]
        scenes.append({
            "purpose": purpose, "title": title, "text": text,
            "visual_type": visual, "labels": labels, "motion": VISUALS[visual],
            "start_frame": start, "end_frame": end,
            "source_dependency": {
                "record": record["id"],
                "fields": fields,
                "source_url": lead["url"],
                "asset_origin": "original_explanatory_graphic",
            },
            "comparison": comparison if visual == "comparison" else None,
        })
        start = end
    return {
        "schema_version": 1, "status": "review_only", "record_id": record["id"], "slug": record["slug"],
        "record_sha256": digest, "record_status": record["content_status"], "audio": "none",
        "palette": direction["palette"] if direction else "paper",
        "edition_type": record["event_type"], "event_date": record["event_date"],
        "edition_date": edition_date(record["published_at"]), "sources": sources, "lead_source": lead,
        "limitations": record["limitations"], "brazil_status": record["brazil_status"],
        "brazil_note": record["brazil_note"], "scenes": scenes, "duration_frames": start,
        "fps": FPS, "width": 1080, "height": 1920,
    }


def srt_clock(frame):
    seconds, ms = divmod((frame * 1000 + FPS // 2) // FPS, 1000)
    return f"{seconds // 3600:02}:{seconds // 60 % 60:02}:{seconds % 60:02},{ms:03}"


def write_text_bundle(plan, stage):
    cues, transcript = [], []
    for scene in plan["scenes"]:
        start, end = scene["start_frame"], scene["end_frame"]
        window = f"{srt_clock(start)} --> {srt_clock(end)}"
        title = " ".join(scene["title"].split())
        transcript.append(f"{window}\n{title}\n{scene['text']}")
        lines = wrap(f"{title} {scene['text']}", width=43)
        blocks = ["\n".join(lines[i:i + 2]) for i in range(0, len(lines), 2)]
        weight, elapsed, cue_start = sum(map(len, blocks)), 0, start
        for block in blocks:
            elapsed += len(block)
            cue_end = start + round((end - start) * elapsed / weight)
            cues.append(f"{len(cues) + 1}\n{srt_clock(cue_start)} --> {srt_clock(cue_end)}\n{block}\n")
            cue_start = cue_end
    lead = plan["lead_source"]
    transcript.append(f"Fonte: {lead['publisher']} · {lead['date']}\n{lead['url']}\n"
                      f"Edição: Vértice Intelligence · {plan['edition_date']}")
    (stage / "legendas.srt").write_text("\n".join(cues), encoding="utf-8")
    (stage / "transcricao.txt").write_text("\n\n".join(transcript) + "\n", encoding="utf-8")


def validate_video(path, plan):
    probe = subprocess.check_output(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_streams", "-show_format", "-of", "json", path],
        text=True,
    )
    info = json.loads(probe)
    (video,) = info["streams"]
    expected = ("h264", plan["width"], plan["height"], f"{FPS}/1", plan["duration_frames"])
    actual = (video["codec_name"], video["width"], video["height"], video["avg_frame_rate"], int(video["nb_frames"]))
    if actual != expected or video["pix_fmt"] not in {"yuv420p", "yuvj420p"}:
        raise ValueError("Unexpected motion video media profile")
    if abs(float(info["format"]["duration"]) - plan["duration_frames"] / FPS) > 1 / FPS:
        raise ValueError("Motion video duration differs from its scene plan")
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-i", path, "-f", "null", "-"], check=True)


def render(record, output, browser=None):
    plan = plan_record(record)
    output = Path(output).resolve()
    if output.exists():
        raise ValueError("Choose a new output directory")
    output.parent.mkdir(parents=True, exist_ok=True)
    evidence = model.check_sources(record)
    with TemporaryDirectory(dir=output.parent) as temp:
        work = Path(temp)
        stage = work / "bundle"
        stage.mkdir()
        props = work / "props.json"
        write_json(props, {"plan": plan})
        write_text_bundle(plan, stage)
        movie = stage / "reel.mp4"
        command = [str(RENDERER / "node_modules/.bin" / ("remotion.cmd" if os.name == "nt" else "remotion")),
                   "render", "src.jsx", "ObservatorioMotion", str(work / "render.mp4"),
                   f"--props={props}", "--concurrency=2", "--codec=h264", "--pixel-format=yuv420p",
                   "--crf=18", "--log=warn"]
        if browser:
            command.append(f"--browser-executable={Path(browser).resolve()}")
        subprocess.run(command, cwd=RENDERER, check=True)
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", work / "render.mp4",
                        "-c", "copy", "-movflags", "+faststart", movie], check=True)
        validate_video(movie, plan)
        checksums = {}
        for file in sorted(stage.iterdir()):
            with file.open("rb") as stream:
                checksums[file.name] = file_digest(stream, "sha256").hexdigest()
        write_json(stage / "visual-manifest.json", {**plan, "source_checks": evidence, "sha256": checksums})
        stage.rename(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("slug")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--browser", help="Optional Chrome/Chromium executable")
    args = parser.parse_args()
    records = {r["slug"]: r for r in model.load_records()}
    if args.slug not in records:
        parser.error("Unknown editorial slug")
    render(records[args.slug], args.output, args.browser)
    print(f"Validated motion review bundle: {args.output}")


if __name__ == "__main__":
    main()
