# Vértice Intelligence

Public feeds and the 08:00 São Paulo Radar export enter a candidate queue. The six editorial roles in [AGENTS.md](../AGENTS.md) turn a candidate into a reviewed JSON record. Python generates the static edition and the release manifest. Pillow, eSpeak NG and FFmpeg produce and validate the Portuguese media kit. GitHub Actions proposes the generated site changes for human review.

| Path | Purpose |
| --- | --- |
| `editorial/intake.py`, `feeds.json` | Radar JSON, Google Search Central, GitHub Changelog and IBGE. See [intake](INTAKE.md). |
| `editorial/records/`, `schema.json`, `model.py` | Versioned evidence, review and state history. |
| `editorial/pipeline.py`, `sitegen.py` | Review artifact, static pages, RSS, sitemap and repeatable output. |
| `editorial/media.py`, `distribution.py`, `growth.py` | Captioned Reel, social graphics and copy, tagged links and offline commercial reporting. See [channels](CHANNELS.md). |
| `observatorio/`, `robots.txt` | Static Pages output, editorial search and local favorites. |
| `.github/workflows/observatorio.yml` | Pull request checks, scheduled collect and build, manual run, content proposal. |

## Run the demo or prepare an edition

Use Python 3.12, FFmpeg/ffprobe with H.264 and AAC, eSpeak NG with the pt-br voice, and DejaVu Sans fonts available to Pillow. On Debian/Ubuntu and WSL these are `ffmpeg espeak-ng fonts-dejavu-core`. On native Windows, set the respective binaries on PATH and install DejaVu Sans fonts. From the repository root in PowerShell or Bash:

```shell
python -m pip install -r editorial/requirements.txt
python -m unittest discover -s editorial -t . -v
python -m editorial.pipeline --output build/preview --force-media --stage-site
python -m http.server 8000
```

Open `http://localhost:8000/observatorio/`. Change the output directory for repeated reviews. The multimedia files are in `build/preview/packages/frete-search-console/`. The record reports 65/100. Its example uses invented delivery times and a dated Google announcement. Inspect the source evidence in `build/preview/evidence.json`.

## Editorial and publication gates

1. Promote a candidate using the intake CLI. Confirm the event date and the covered markets, record exact evidence from a primary source or two independent publishers, and label what remains unconfirmed in Brazil. The automated verifier checks that the evidence and date are present. A human reviewer decides whether the evidence actually supports every material claim.
2. Append verified, draft and approved history entries as review progresses. Add review flags for the claim, rights and privacy, and specialist review for high-risk coverage. Add the three practical steps and social copy.
3. Fresh news needs at least 65 points and an event within seven days of the edition date. Weights and thresholds are in `config.json`. An older verified fact can become an explicitly educational guide. Empty news days generate an archival guide for review if prior validated material exists.
4. Merge the reviewed record on its own to let the next scheduled run propose the generated Pages files. For a single combined PR, build with `--stage-site` and commit the generated directory along with the inputs. Inspect HTML, sources, CSS, timing, images, subtitles and channel text before approving. After deployment, record the `published` status in a follow-up revision if needed. Preserve the first edition date and append any subsequent corrections.
5. Actions runs at 09:37 São Paulo time on the default branch, and can be started with **Run workflow** after this workflow is merged. The content proposal uses the repository’s GITHUB_TOKEN. If repository settings disallow Actions from creating PRs, the run still provides review files and the static edition can be proposed from an authenticated checkout. GitHub may require approval for a bot-created PR’s checks. Enable the Actions failure notification in the maintainer’s GitHub notification settings if desired. [Workflow PR setting](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)

The Radar automation is an existing ChatGPT task. An authorized Work session can see its output. The GitHub runner has no authorized reader for those runs. Keep the handoff as a local JSON export or use the independent public feeds. Raw candidates and metrics stay outside Pages. The initial demo is approved for branch review. Social accounts and Search Console verification must be confirmed before sending or posting. Site Search Console and social handoffs are documented in [CHANNELS.md](CHANNELS.md).
