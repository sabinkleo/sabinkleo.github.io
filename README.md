# Vértice Labs

Static GitHub Pages site for `https://verticelabs.me/`.

## Routes

- `/` — extensible Vértice Labs module catalog.
- `/tuning/` — automotive pre-dyno intake tool.
- `/tunning/` — compatibility redirect to `/tuning/`.

The site preserves `CNAME` for `verticelabs.me` and has no build step or
runtime dependencies. The tuning module keeps its configured WhatsApp
destination, performs all assessment locally in the browser, and does not
claim that a WhatsApp click is a confirmed sale or qualified lead.

## Local verification

From the repository root:

```powershell
python -m http.server 8000
```

Open `/`, `/tuning/`, and `/tunning/` on the local server. The source module
contains no analytics IDs; do not add tracking IDs or customer data without
approval.
