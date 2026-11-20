"""Offline graphics and narrated social video generated from a reviewed record."""
from __future__ import annotations

import argparse
from datetime import date
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import wave

from PIL import Image, ImageDraw, ImageFont


INK = "#10120f"
PAPER = "#f0f0e6"
LIME = "#d3fa43"
MUTED = "#a6afa0"
RULE = "#495145"
FPS = 25
W = 1080
STAGES = ("approved", "published", "updated")


@lru_cache(maxsize=100)
def font(face: str, size: int):
    # Pillow/FreeType can resolve these installed fonts by filename on Linux.
    return ImageFont.truetype(f"DejaVu{face}.ttf", size=size)


def block(draw, value, rect, *, face="Sans", size, minimum, fill, align="left"):
    """Wrap by measured glyph width, shrink to fit, then reject overflow."""
    x, y, right, bottom = rect
    words = value.split()
    if not words:
        raise ValueError("An editorial text block is empty")
    for pts in range(size, minimum - 1, -2):
        f = font(face, pts)
        lines = [words[0]]
        for word in words[1:]:
            joined = f"{lines[-1]} {word}"
            if draw.textlength(joined, font=f) <= right - x - 4:
                lines[-1] = joined
            else:
                lines.append(word)
        lines = "\n".join(lines)
        opts = dict(font=f, spacing=max(5, pts // 6), align=align, stroke_width=0)
        l, t, r, b = draw.multiline_textbbox((0, 0), lines, **opts)
        if r - l <= right - x and b - t <= bottom - y:
            draw.multiline_text((x - l, y - t), lines, fill=fill, **opts)
            return
    raise ValueError(f"Text overflows its graphic at {minimum}px: {value[:90]}")


def comparison(draw, obj, top, height):
    gap, width = 16, 463
    for i, side in enumerate(("left", "right")):
        x = 70 + i * (width + gap)
        draw.rectangle((x, top, x + width, top + height - 65),
                       fill=PAPER if i == 0 else LIME)
        block(draw, obj[f"{side}_label"], (x + 30, top + 34, x + width - 20, top + 94),
              face="SansMono", size=31, minimum=25, fill=INK)
        block(draw, obj[f"{side}_value"], (x + 26, top + 130, x + width - 22, top + height - 89),
              face="Sans-Bold", size=91, minimum=54, fill=INK)
    block(draw, obj["note"], (70, top + height - 43, 1010, top + height - 2),
          face="SansMono", size=26, minimum=22, fill=PAPER)


def source_card(draw, source, top, height):
    """An original abstract filing-card illustration with the actual source and date."""
    x, right = 70, 1009
    bottom = top + height
    draw.rectangle((x + 56, top, right, bottom - 49), outline=RULE, width=3)
    draw.rectangle((x + 28, top + 24, right - 28, bottom - 24), fill=INK, outline=MUTED, width=3)
    draw.rectangle((x, top + 49, right - 56, bottom), fill=PAPER)
    draw.rectangle((x, top + 49, x + 14, bottom), fill=LIME)
    block(draw, "FONTE PRIMÁRIA" if source["kind"] == "primary" else "FONTE DA EDIÇÃO", (x + 39, top + 84, right - 96, top + 130),
          face="SansMono", size=27, minimum=25, fill=INK)
    block(draw, source["publisher"], (x + 36, top + 150, right - 102, bottom - 106),
          face="Serif", size=65, minimum=36, fill=INK)
    draw.line((x + 38, bottom - 83, right - 99, bottom - 83), fill=RULE, width=2)
    date_label = date.fromisoformat(source["date"]).strftime("%d.%m.%Y")
    block(draw, date_label, (x + 39, bottom - 60, right - 100, bottom - 20),
          face="SansMono", size=30, minimum=24, fill=INK)



def route_card(draw, slug, top, height):
    """A final frame that leaves the exact destination visible for manual sharing."""
    bottom = top + height
    draw.rectangle((70, top, 1010, bottom), fill=LIME)
    block(draw, "ABRIR A MATÉRIA", (105, top + 36, 800, top + 88),
          face="SansMono", size=28, minimum=25, fill=INK)
    draw.line((903, top + 95, 961, top + 37), fill=INK, width=8)
    draw.line((901, top + 37, 965, top + 37, 965, top + 101), fill=INK, width=8)
    block(draw, "verticelabs.me", (103, top + 113, 960, bottom - 78),
          face="Serif", size=73, minimum=44, fill=INK)
    # Insert break opportunities after slashes/hyphens only when the path needs them.
    # The supplied social captions retain the clickable, fully qualified address.
    path = f"/observatorio/{slug}/"
    left, right = 106, 964
    if draw.textlength(path, font=font("SansMono", 27)) > right - left:
        path = path.replace("/", "/ ").replace("-", "- ")
    block(draw, path, (left, bottom - 71, right, bottom - 12),
          face="SansMono", size=27, minimum=20, fill=INK)


def plate(record, kind, index, entry):
    tall = kind != "carousel"
    h = 1920 if tall else 1350
    image = Image.new("RGB", (W, h), INK)
    draw = ImageDraw.Draw(image)
    # Allow space for the native controls that overlay vertical video.
    top = 145 if tall else 70
    draw.polygon([(70, top), (86, top), (102, top+30), (93, top+45)], fill=LIME)
    draw.polygon([(100, top+40), (119, top), (136, top)], fill=LIME)
    block(draw, "VÉRTICE INTELLIGENCE", (155, top+6, 912, top+44),
          face="Sans-Bold", size=33, minimum=31, fill=PAPER)
    draw.line((70, top + 88, 1010, top + 88), fill=RULE, width=2)

    archive = record["event_type"] == "educational"
    label = ("GUIA DE ARQUIVO" if archive else "OBSERVATÓRIO") + "   /   " + record["sector"].upper()
    eyebrow = top + (170 if tall else 151)
    block(draw, label, (70, eyebrow, 1010, eyebrow + 55), face="SansMono",
          size=30, minimum=23, fill=LIME)
    block(draw, entry["title"], (65, eyebrow + 94, 994, 750 if tall else 566),
          face="Serif", size=104 if tall else 90, minimum=49, fill=PAPER)
    figure_top, figure_height = (842, 365) if tall else (605, 297)
    obj = record["social_package"].get("comparison")
    visual_positions = {"carousel": {0, 2}, "stories": {0}, "reel": {0, 1}}
    if index == len(record["social_package"][kind]) - 1:
        route_card(draw, record["slug"], figure_top, figure_height)
    elif obj and index in visual_positions[kind]:
        comparison(draw, obj, figure_top, figure_height)
    else:
        source_card(draw, record["sources"][0], figure_top, figure_height)

    body_top, body_end = (1324, 1590) if tall else (971, 1174)
    block(draw, entry.get("body") or entry["voice"], (70, body_top, 994, body_end),
          size=56 if tall else 43, minimum=35 if tall else 33,
          fill=PAPER)
    footer = 1685 if tall else 1244
    total = {"reel": 5, "carousel": 6, "stories": 3}[kind]
    segment = 944 / total
    for j in range(total):
        x = 70 + j * segment
        draw.rectangle((x, footer, x + segment - 10, footer + 3), fill=LIME if j <= index else RULE)
    block(draw, "verticelabs.me/observatorio", (70, footer + 27, 918, footer + 62),
          face="SansMono", size=24, minimum=22, fill=MUTED)
    block(draw, f"{index + 1}/{total}", (930, footer + 27, 1010, footer + 62),
          face="SansMono", size=24, minimum=22, fill=MUTED)
    return image


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def clock(frames):
    seconds, ms = divmod(frames * 1000 // FPS, 1000)
    return f"00:{seconds // 60:02}:{seconds % 60:02},{ms:03}"


def reel(record, work, dest):
    scenes = record["social_package"]["reel"]
    clips = []
    for i, scene in enumerate(scenes):
        wavfile = work / f"{i}.wav"
        run("espeak-ng", "-v", "pt-br", "-s", "155", "-w", str(wavfile), "--stdin",
            input=scene["voice"].encode("utf-8"))
        with wave.open(str(wavfile), "rb") as src:
            rate = src.getframerate()
            if src.getnchannels() != 1 or src.getsampwidth() != 2 or rate != 22050:
                raise ValueError("Unexpected eSpeak PCM audio format")
            audio = src.readframes(src.getnframes())
        if not audio or not any(audio):
            raise ValueError("Empty narration")
        frames = math.ceil((len(audio) / (2 * rate) + 0.35) * FPS)
        clips.append((audio, frames))

    lengths = [frames for _, frames in clips]
    # Leave the hook immediately visible. Allocate extra reading time evenly
    # on short scripts, and ask for shorter copy if it cannot fit 35 seconds.
    missing = max(0, 22 * FPS - sum(lengths))
    for index in range(missing):
        lengths[index % len(lengths)] += 1
    if sum(lengths) > 35 * FPS:
        raise ValueError("Narration exceeds 35 seconds; shorten the script")
    concat, subtitles, timeline, elapsed = [], [], [], 0
    with wave.open(str(work / "voice.wav"), "wb") as joined:
        joined.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        for i, (scene, (audio, _), frames) in enumerate(zip(scenes, clips, lengths)):
            plate(record, "reel", i, scene).save(work / f"{i}.png")
            concat.extend((f"file '{i}.png'", f"duration {frames/FPS:.3f}"))
            samples = round((elapsed + frames) * rate / FPS) - round(elapsed * rate / FPS)
            joined.writeframes(audio + bytes(samples * 2 - len(audio)))
            subtitles.append(f"{i+1}\n{clock(elapsed)} --> {clock(elapsed+frames)}\n{scene['voice']}\n")
            timeline.append({"start_frame": elapsed, "end_frame": elapsed + frames, "voice": scene["voice"]})
            elapsed += frames
    concat.append(f"file '{len(clips)-1}.png'")
    (work / "frames.txt").write_text("\n".join(concat) + "\n", encoding="utf-8")
    (dest / "legendas.srt").write_text("\n".join(subtitles), encoding="utf-8")
    (dest / "narracao.txt").write_text("\n\n".join(s["voice"] for s in scenes) + "\n", encoding="utf-8")
    run("ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat",
        "-safe", "1", "-i", "frames.txt", "-i", "voice.wav", "-t", f"{elapsed/FPS:.3f}",
        "-map", "0:v:0", "-map", "1:a:0", "-vf", f"fps={FPS},format=yuv420p",
        "-c:v", "libx264", "-threads", "2", "-preset", "veryfast", "-crf", "21",
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(dest / "reel.mp4"), cwd=work)
    return timeline


def digest(path):
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def validate(output: Path) -> dict:
    """Verify every PNG and checksum, subtitle timing and a full video/audio decode."""
    output = Path(output)
    m = json.loads((output / "media.json").read_text(encoding="utf-8"))
    images = {}
    for kind, count, size in (("carousel", 6, (W, 1350)), ("stories", 3, (W, 1920))):
        expected = [f"{kind}/{i:02}.png" for i in range(1, count+1)]
        actual = sorted(p.relative_to(output).as_posix() for p in (output / kind).glob("*.png"))
        if expected != actual:
            raise ValueError(f"Missing or extra {kind} image")
        for name in expected:
            with Image.open(output / name) as im:
                im.load()
                if im.format != "PNG" or im.size != size or im.mode != "RGB":
                    raise ValueError(f"Wrong image format/dimensions: {name}")
            images[name] = list(size)
    required = set(images) | {"legendas.srt", "narracao.txt", "reel.mp4"}
    if set(m["sha256"]) != required or set(m["alt"]) != set(images):
        raise ValueError("Incomplete media manifest")
    for name in required:
        if digest(output / name) != m["sha256"][name]:
            raise ValueError(f"Media checksum mismatch: {name}")
    for name in images:
        if not m["alt"][name].strip():
            raise ValueError(f"Missing alternative text: {name}")
    scenes, total = m["timeline"], 0
    if len(scenes) != 5:
        raise ValueError("Expected five scenes")
    cues = []
    for i, scene in enumerate(scenes, start=1):
        end = scene["end_frame"]
        if scene["start_frame"] != total or end <= total:
            raise ValueError("Subtitle sequence is discontinuous")
        cues.append(f"{i}\n{clock(total)} --> {clock(end)}\n{scene['voice']}\n")
        total = end
    if not 20 * FPS <= total <= 35 * FPS:
        raise ValueError("Reel duration outside the editorial limits")
    if (output / "legendas.srt").read_text(encoding="utf-8") != "\n".join(cues):
        raise ValueError("Subtitle content differs from the narration timeline")
    movie = str(output / "reel.mp4")
    probe = json.loads(run("ffprobe", "-v", "error", "-show_streams", "-show_format",
                           "-of", "json", movie, capture_output=True).stdout)
    streams = {s["codec_type"]: s for s in probe["streams"]}
    video, audio = streams["video"], streams["audio"]
    if (video["codec_name"], video["width"], video["height"], video["pix_fmt"],
        video["avg_frame_rate"], audio["codec_name"]) != ("h264", W, 1920, "yuv420p", f"{FPS}/1", "aac"):
        raise ValueError("Incorrect encoded media profile")
    if any(abs(float(s["duration"]) - total / FPS) > 0.10 for s in (video, audio, probe["format"])):
        raise ValueError("Video/audio length differs from subtitle timeline")
    run("ffmpeg", "-nostdin", "-v", "error", "-xerror", "-threads", "2", "-i", movie,
        "-map", "0:v", "-map", "0:a", "-f", "null", "-")
    return m


def render(record: dict, output: Path) -> dict:
    """Produce a complete, validated package before replacing any previously good files."""
    if record["content_status"] not in STAGES:
        raise ValueError("Public media requires an approved editorial record")
    social = record["social_package"]
    for key, count in (("carousel", 6), ("stories", 3), ("reel", 5)):
        if len(social[key]) != count:
            raise ValueError(f"Expected {count} {key} entries")
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=output.parent) as tmp:
        work = Path(tmp)
        package = work / "package"
        package.mkdir()
        alt = {}
        for kind in ("carousel", "stories"):
            (package / kind).mkdir()
            for i, entry in enumerate(social[kind]):
                rel = f"{kind}/{i+1:02}.png"
                plate(record, kind, i, entry).save(package / rel)
                alt[rel] = entry["alt"]
        timeline = reel(record, work, package)
        hashes = {p.relative_to(package).as_posix(): digest(p)
                  for p in sorted(package.rglob("*")) if p.is_file()}
        metadata = {
            "slug": record["slug"], "title": record["title"], "updated_at": record["updated_at"],
            "sources": [s["url"] for s in record["sources"]], "alt": alt,
            "duration_seconds": timeline[-1]["end_frame"] / FPS, "fps": FPS, "timeline": timeline,
            "provenance": "Texto da edição aprovada. Composição tipográfica e ilustração originais "
                          "da Vértice Labs. Voz sintética local eSpeak NG pt-br. Sem trilha musical "
                          "ou imagem de terceiros. Fontes DejaVu instaladas no sistema.",
            "sha256": hashes,
        }
        (package / "media.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
                                            encoding="utf-8")
        validate(package)
        # Preserve distribution exports sharing the slug directory.
        for p in sorted(package.rglob("*")):
            relative = p.relative_to(package)
            if p.is_dir():
                (output / relative).mkdir(exist_ok=True)
            else:
                p.replace(output / relative)
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("record", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if __package__:
        from .model import validate as validate_record
    else:
        from model import validate as validate_record
    item = json.loads(args.record.read_text(encoding="utf-8"))
    validate_record(item)
    report = render(item, args.output)
    print(f"{report['slug']} · {report['duration_seconds']:.2f}s · 9 PNG · QA ok")
