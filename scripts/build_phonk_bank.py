#!/usr/bin/env python3
"""Build an original, sample-free phonk soundtrack bank for editorial reels."""

import argparse
import json
import math
from pathlib import Path
import struct
import subprocess
from tempfile import TemporaryDirectory
import wave

from reel.beat import DURATION, SAMPLE_RATE, make_track

ROOT = Path(__file__).resolve().parents[1]
BPM = 120
# Each bar lists (beat offset, MIDI note) pairs for the synthesized cowbell.
TRACKS = (
    ("night-shift", "Night Shift", ((0, 69), (0.75, 72), (1.5, 76), (2.5, 67), (3, 69))),
    ("low-beam", "Low Beam", ((0, 62), (0.5, 65), (1.25, 69), (2, 60), (3.5, 65))),
    ("after-hours", "After Hours", ((0, 65), (1, 68), (1.75, 72), (2.25, 63), (3, 60))),
)


def add_melody(backing, pattern, wav_path):
    audio = [sample / 32768 for (sample,) in struct.iter_unpack("<h", backing)]
    seconds_per_beat = 60 / BPM
    for bar in range(DURATION * BPM // (60 * 4)):
        for beat, note in pattern:
            start = round((bar * 4 + beat) * seconds_per_beat * SAMPLE_RATE)
            frequency = 440 * 2 ** ((note - 69) / 12)
            for offset in range(min(round(0.19 * SAMPLE_RATE), len(audio) - start)):
                time = offset / SAMPLE_RATE
                phase = math.tau * frequency * time
                envelope = min(1, time / 0.003) * math.exp(-25 * time)
                tone = math.sin(phase) + 0.45 * math.sin(phase * 1.48)
                audio[start + offset] += 0.23 * envelope * tone

    with wave.open(str(wav_path), "wb") as output:
        output.setparams((1, 2, SAMPLE_RATE, 0, "NONE", "not compressed"))
        frames = bytearray(len(audio) * 2)
        for i, sample in enumerate(audio):
            fade = min(1, (len(audio) - 1 - i) / (0.05 * SAMPLE_RATE))
            struct.pack_into("<h", frames, i * 2, round(32767 * math.tanh(sample) * fade))
        output.writeframes(frames)


def build(output):
    output.mkdir(parents=True, exist_ok=True)
    catalog = {"version": 1, "tracks": []}
    with TemporaryDirectory() as scratch:
        wav_path = Path(scratch) / "track.wav"
        make_track(str(wav_path))
        with wave.open(str(wav_path), "rb") as original:
            backing = original.readframes(original.getnframes())

        for track_id, title, pattern in TRACKS:
            add_melody(backing, pattern, wav_path)
            filename = f"{track_id}.mp3"
            subprocess.run(
                ["ffmpeg", "-v", "error", "-nostdin", "-y", "-i", str(wav_path),
                 "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", "64k",
                 str(output / filename)],
                check=True,
            )
            catalog["tracks"].append({
                "id": track_id,
                "title": title,
                "file": filename,
                "duration_seconds": DURATION,
                "bpm": BPM,
                "source": "Original synthesis by scripts/build_phonk_bank.py",
            })

    (output / "catalog.json").write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "assets" / "audio" / "phonk")
    build(parser.parse_args().output)
