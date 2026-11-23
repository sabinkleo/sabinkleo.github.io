# Observatório motion review

Run from the site repository root with Python 3.12, Node 24, FFmpeg and Chromium.
The renderer reuses the pinned Remotion/React stack and bundled typography of the
[KLEIN LAB shorts project](https://github.com/sabinkleo/bucetinhadoinfernodcoaralhgo/tree/d6b9b58ad525c87e87295e8ce668a95a5e58e68a/shorts).
It installs independently so public PR builds need no private checkout or token.

```sh
python -m pip install -r editorial/requirements.txt
npm ci --prefix editorial/motion --ignore-scripts
python -m editorial.motion_video github-cli-eventos-pr --output build/motion/github-cli
```

Provide `--browser /path/to/chromium` to use an installed browser. Otherwise Remotion
downloads its headless browser. The output path must be a new directory.

The command validates the existing approved record, checks evidence anchors and
source dates using the existing verifier, builds a visual plan, and renders a
1080×1920, 30 fps H.264 preview. The resulting directory contains `reel.mp4`,
`transcricao.txt`, `legendas.srt`, and `visual-manifest.json`. The manifest includes
the record hash, evidence receipts, limitations, Brazil applicability, frame ranges,
motion directions, asset provenance and file hashes.

Both prototype stories have hand-directed scenes in `directions.json`. Each entry
is tied to its reviewed record hash. When the record changes, review the captions
and visuals against the new record before updating that hash. Records without
custom direction use their approved social lines, original diagrams, dated source
cards, and the approved comparison when present. Real screenshots and audio are
outside this version. The MP4 is silent and has burned-in Portuguese captions,
and the SRT is available for editing or a later voice track.

The separate pull-request workflow uploads an Android-downloadable review bundle.
Its default is the GitHub Event Streams story. The manual workflow input accepts
another approved slug. Existing media kits and site publication run independently.
