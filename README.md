# Vértice Labs

Static GitHub Pages site for `https://verticelabs.me/`.

## Routes

- `/` — extensible Vértice Labs module catalog.
- `/n1/` — local inventory, movements and reconciliation across five stockroom profiles. The page includes a downloadable offline HTML and two demonstration rounds.
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

Open `/`, `/n1/`, `/tuning/`, and `/tunning/` on the local server. In N1, each warehouse demo round starts with 20 items, three discrepancies and 17 matches. The demo and personal inventory have separate storage for each profile. A JSON backup can move inventory between the website and the offline copy. The source module
contains no analytics IDs; do not add tracking IDs or customer data without
approval.
