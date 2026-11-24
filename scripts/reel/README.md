# Editorial Reel

Install Python 3.11+, Node.js, curl, Chromium, FFmpeg and FFprobe on Linux, macOS or WSL.

```sh
npm install --prefix scripts/reel
python scripts/run_reel.py --url https://www.canva.com/newsroom/news/canva-mcp-update/
python scripts/run_reel.py --url https://www.canva.com/newsroom/news/canva-mcp-update/ --audio /path/to/phonk.mp3
```

English is the default. Use `--lang pt` for Portuguese. When the source language is different or unknown, provide `--translation FILE.json` with reviewed text and the exact `source_url`, `source_title`, `source_summary`, target `lang`, translated `title` and `summary`. Source evidence is retained; a translation is not independently verified by the renderer.

The command writes article.md, social.md, reel.mp4 and execution.log to a new directory under build/reel/. Media is taken from the official source or a real page capture. For offline replay, pass `--snapshot DIR` with source.html, media.json (the url field), and media. Use `--browser` to select Chromium.

Pass `--audio FILE` (alias `--phonk`) to loop/trim a local soundtrack to 12 seconds with a 50 ms fade-out. Without an audio file, the original generated 120 BPM bed is used. Supplied audio is not automatically tempo-matched.

The guard history defaults to build/reel/assets/used_memes.json. Use `--assets` to share existing history. The editorial composition uses source material and records an empty reaction list.
