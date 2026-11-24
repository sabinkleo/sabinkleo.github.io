#!/usr/bin/env python3
"""Prepare a source-checked article, captions, and a Remotion video for review."""
import argparse
from datetime import datetime
from html import unescape
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
from urllib.parse import urljoin, urlsplit

from reel.beat import make_track

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "scripts" / "reel"
LIMIT = 3  # Initial attempt plus two retries.
CLOSING = "O que muda na prática?"
HTTP = ("http", "https")


def url_key(value):
    parts = urlsplit(value)
    if parts.scheme not in HTTP or not parts.hostname or parts.username or parts.password:
        raise ValueError("Use a public HTTP(S) URL without credentials")
    return parts._replace(fragment="", path=parts.path.rstrip("/") or "/").geturl()


class Source(HTMLParser):
    def __init__(self, document):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.media = []
        self.canonical = ""
        self.article_depth = 0
        self.in_heading = False
        self.heading = []
        self.visible = []
        self.ignored = 0
        self.feed(document)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("script", "style"):
            self.ignored += 1
        if tag == "article":
            self.article_depth += 1
        if tag == "h1" and not self.heading:
            self.in_heading = True
        if tag == "meta":
            name = attrs.get("property") or attrs.get("name") or attrs.get("itemprop")
            if name and attrs.get("content"):
                self.meta.setdefault(name, attrs["content"])
        if tag == "link" and "canonical" in attrs.get("rel", "").split():
            self.canonical = attrs.get("href", "")
        if tag in ("video", "source") and self.article_depth and attrs.get("src"):
            self.media.append(attrs["src"])

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.ignored = max(0, self.ignored - 1)
        if tag == "article":
            self.article_depth = max(0, self.article_depth - 1)
        if tag == "h1":
            self.in_heading = False

    def handle_data(self, data):
        if self.in_heading:
            self.heading.append(data)
        if self.article_depth and not self.ignored:
            self.visible.append(data)


def clean(value):
    return " ".join(value.split())


def md(value):
    return re.sub(r'([\\`*_{}\[\]<>#!|])', r'\\\1', value)


def short(value, width):
    return value if len(value) <= width else value[:width - 1].rsplit(" ", 1)[0] + "…"


class Runner:
    def __init__(self, log):
        self.log = log

    def note(self, message):
        print(message, flush=True)
        with self.log.open("a", encoding="utf-8") as stream:
            stream.write(message + "\n")

    def step(self, name, action, retries=LIMIT):
        for attempt in range(1, retries + 1):
            self.note(f"{name}: attempt {attempt}/{retries}")
            try:
                result = action()
            except (OSError, ValueError, subprocess.SubprocessError) as error:
                self.note(f"{name}: {error}")
                if attempt == retries:
                    raise
            else:
                self.note(f"{name}: OK")
                return result

    def cmd(self, args, timeout):
        with self.log.open("ab") as stream:
            with subprocess.Popen(args, stdout=stream, stderr=stream, start_new_session=True) as process:
                try:
                    status = process.wait(timeout)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
                    raise
        if status:
            raise subprocess.CalledProcessError(status, args)

    def download(self, url, output, limit):
        url_key(url)
        output.unlink(missing_ok=True)
        self.cmd(["curl", "-fsSL", "--proto", "=http,https", "--proto-redir", "=http,https",
                  "--max-time", "20", "--max-filesize", str(limit),
                  "-o", str(output), "--", url], 24)


def date_from(source, document, title):
    date = source.meta.get("article:published_time") or source.meta.get("datePublished")
    if not date:
        for match in re.finditer(r'"(?:datePublished|publishedAt)"\s*:\s*"([^"]+)"', document):
            context = unescape(document[max(0, match.start() - 360):match.start()])
            if title in context:
                date = match[1]
                break
    if date:
        try:
            return datetime.fromisoformat(date.replace("Z", "+00:00")).date().isoformat()
        except ValueError:
            pass
    return "Não identificada na fonte"


def scrape(url, snapshot, workspace, runner):
    if snapshot:
        document_path = snapshot / "source.html"
        runner.note(f"HTTP source mode: saved official HTML ({document_path.name})")
    else:
        document_path = workspace / "source.html"
        runner.step("Download article", lambda: runner.download(url, document_path, 8_000_000))
    document = document_path.read_text(encoding="utf-8")
    source = Source(document)
    canonical = url_key(urljoin(url, source.canonical or source.meta.get("og:url") or url))
    if snapshot and canonical != url:
        raise ValueError("Saved HTML canonical URL does not match the requested URL")
    title = clean("".join(source.heading) or source.meta.get("og:title", ""))
    summary = clean(source.meta.get("og:description") or source.meta.get("description", ""))
    if not title or not summary or not source.heading:
        raise ValueError("Source must expose an article heading and a description")
    if source.visible:
        terms = set(re.findall(r"\w{4,}", summary.casefold()))
        visible = set(re.findall(r"\w{4,}", " ".join(source.visible).casefold()))
        if terms and len(terms & visible) * 2 < len(terms):
            raise ValueError("The publisher description does not match the visible article text")
        runner.note("Matched publisher description against the visible article")
    else:
        runner.note("Publisher evidence is limited to the visible heading and page metadata")
    if source.meta.get("og:title") and clean(source.meta["og:title"]) != title:
        runner.note("Source heading and social metadata differ; using the visible heading")
    company = source.meta.get("publisher") or urlsplit(canonical).hostname.removeprefix("www.").split(".")[0].capitalize()
    return source, document, canonical, title, summary, short(clean(company), 48), date_from(source, document, title)


def media_for(source, document, url, snapshot, workspace, browser, runner):
    videos = re.findall(r'https?://[^"\s<>]+?\.mp4(?:\?[^"\s<>]+)?', document, flags=re.I)
    images = [source.meta.get(key) for key in ("og:image", "twitter:image")]
    candidates = list(dict.fromkeys(urljoin(url, unescape(item)) for item in [
        source.meta.get("og:video:secure_url"), source.meta.get("og:video"),
        *source.media, *videos, *images,
    ] if item))

    def normalize(path):
        probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                                "format=duration:stream=codec_type", "-of", "json", str(path)],
                               capture_output=True, check=True, timeout=12)
        data = json.loads(probe.stdout)
        if not any(stream["codec_type"] == "video" for stream in data.get("streams", [])):
            raise ValueError("Source media has no video or image stream")
        duration = data.get("format", {}).get("duration")
        duration = float(duration) if duration not in (None, "N/A") else 0
        moving = duration >= 0.5
        ffmpeg = ["ffmpeg", "-v", "error", "-nostdin", "-y"]
        runner.cmd(ffmpeg + ["-i", str(path), "-frames:v", "1", "-vf", "scale=1080:-2",
                             str(workspace / "poster.jpg")], 25)
        if moving:
            runner.cmd(ffmpeg + ["-stream_loop", "-1", "-i", str(path), "-t", "12",
                                 "-an", "-vf", "fps=30,scale=1080:-2", "-c:v", "libx264",
                                 "-preset", "veryfast", "-pix_fmt", "yuv420p",
                                 str(workspace / "footage.mp4")], 90)
        return moving

    if snapshot:
        info = json.loads((snapshot / "media.json").read_text())
        media_url = url_key(info["url"])
        if media_url not in {url_key(item) for item in candidates if urlsplit(item).scheme in HTTP}:
            raise ValueError("Saved media URL is not present in the official HTML")
        path = snapshot / "media"
        runner.note(f"Media mode: saved official media ({media_url})")
        return runner.step("Normalize official media", lambda: normalize(path)), media_url

    raw = workspace / "download"
    # Bound the candidate list as well as each process. Prefer article-associated assets.
    preferred = list(dict.fromkeys(candidates[:2] + [urljoin(url, item) for item in images if item]))
    for index, candidate in enumerate(preferred[:3], start=1):
        try:
            def prepare():
                runner.download(candidate, raw, 100_000_000)
                return normalize(raw)

            return runner.step(f"Fetch and normalize media candidate {index}", prepare, retries=1), candidate
        except (OSError, ValueError, subprocess.SubprocessError):
            continue
    def screenshot():
        capture = workspace / "capture.png"
        runner.cmd(["node", str(TOOL / "capture.cjs"), url, str(capture), browser], 32)
        return normalize(capture)

    return runner.step("Capture source page", screenshot), url


def write_outputs(out, title, summary, company, date, url, media_url):
    body = f"**O que foi anunciado**\n\n> {md(summary)}"
    (out / "article.md").write_text(
        f"# {md(title)}\n\n**Fonte** [{md(company)}](<{url}>)\n\n"
        f"**Data informada pela fonte** {date}\n\n{body}\n\n"
        f"**Evidência visual** [Material do anúncio](<{media_url}>)\n\n"
        "Verificação editorial limitada ao anúncio original. A matéria registra a declaração da fonte.\n",
        encoding="utf-8",
    )
    caption = f"{summary}\n\nFonte: {company} — {url}"
    (out / "social.md").write_text(
        f"# Instagram Reels\n\n{title}\n\n{caption}\n\n"
        f"# TikTok\n\n{short(title, 120)}\n\n{caption}\n\n"
        f"# YouTube Shorts\n\n{short(title, 100)}\n\n{caption}\n",
        encoding="utf-8",
    )


def validate_render(video):
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(video)],
        capture_output=True, check=True, timeout=15,
    )
    result = json.loads(probe.stdout)
    stream = next((item for item in result["streams"] if item["codec_type"] == "video"), {})
    measured = (stream.get("width"), stream.get("height"), stream.get("avg_frame_rate"), stream.get("nb_frames"))
    if measured != (1080, 1920, "30/1", "360") or abs(float(result["format"]["duration"]) - 12) > 0.05:
        raise ValueError(f"Unexpected Reel dimensions or timing: {measured}")
    if not any(item["codec_type"] == "audio" for item in result["streams"]):
        raise ValueError("Reel is missing audio")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--snapshot", type=Path, help="Replay saved official source.html, media.json and media")
    parser.add_argument("--out", type=Path, default=ROOT / "build" / "reel")
    parser.add_argument("--assets", type=Path, default=ROOT / "build" / "reel" / "assets")
    parser.add_argument("--browser", default=shutil.which("chromium") or shutil.which("google-chrome"))
    args = parser.parse_args()
    url = url_key(args.url)
    remotion = TOOL / "node_modules" / ".bin" / "remotion"
    if not args.browser or not remotion.is_file():
        parser.error("Install Chromium and run npm install --prefix scripts/reel")
    if args.snapshot:
        args.snapshot = args.snapshot.resolve()
    args.out.mkdir(parents=True, exist_ok=True)
    out = Path(tempfile.mkdtemp(prefix="reel-", dir=args.out)).resolve()
    runner = Runner(out / "execution.log")
    runner.note(f"Source: {url}")
    with tempfile.TemporaryDirectory(prefix="reel-media-") as directory:
        workspace = Path(directory)
        source, doc, canonical, title, summary, company, date = scrape(url, args.snapshot, workspace, runner)
        runner.note(f"Source check: heading and publisher description present; date: {date}")
        moving, media_url = media_for(source, doc, canonical, args.snapshot, workspace, args.browser, runner)
        runner.note(f"Media: {media_url}")
        props = workspace / "props.json"
        sentences = re.split(r"(?<=[.!?])\s+", summary, maxsplit=1)
        props.write_text(json.dumps({
            "titles": [short(title, 115), short(sentences[0], 105),
                       short(sentences[-1], 105) if len(sentences) > 1 else f"Anúncio de {company}",
                       CLOSING],
            "company": company, "moving": moving,
        }), encoding="utf-8")
        runner.step("Generate 120 BPM audio bed", lambda: make_track(str(workspace / "track.wav")))
        video = out / "reel.mp4"

        def render():
            video.unlink(missing_ok=True)
            runner.cmd([str(remotion), "render", str(TOOL / "EditorialReel.jsx"), "EditorialReel",
                        str(video), "--props", str(props), "--public-dir", str(workspace),
                        "--browser-executable", args.browser, "--codec", "h264",
                        "--concurrency", "4", "--log", "warn"], timeout=240)
            validate_render(video)

        runner.step("Render and verify 1080×1920, 30 fps, 360 frames, 12 s and audio", render)
        runner.step("Update used_memes.json (no reaction footage selected)", lambda: runner.cmd(
            [sys.executable, str(TOOL / "reaction_guard.py"), "--assets", str(args.assets),
             "approve", str(video)], 10))
        write_outputs(out, title, summary, company, date, canonical, media_url)
    runner.note(f"Complete: {out}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        sys.exit(str(error))
