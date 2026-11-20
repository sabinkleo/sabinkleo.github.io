# Radar intake

Run from the repository root with the editorial Python requirements installed. The queue is a local/review artifact containing public discovery metadata. Keep it outside the Pages tree. In PowerShell the following commands use a sibling directory.

```powershell
python -m editorial.intake collect --state ../intake/intake.json
python -m editorial.intake import ../radar.json --state ../intake/intake.json
(Get-Content -Raw ../intake/intake.json | ConvertFrom-Json).candidates.PSObject.Properties.Value | Select-Object id,title
python -m editorial.intake promote CANDIDATE_ID --state ../intake/intake.json --records editorial/records
```

Replace `CANDIDATE_ID` with one of the ids from the listing. The new JSON in `editorial/records/` contains a proposal, including source title, publisher, permalink and reported date. Verify the event date independently. Choose a descriptive slug before approving. Edit the same file through the ordered states in `schema.json`, retaining its stable id. Repeating promotion preserves the editor's changes. Pending candidates never enter site or social output.

The existing ChatGPT task can export its regular JSON object or a list of objects. A single JSON code fence is accepted. Copy just that output to UTF-8 JSON, without surrounding prose. The importer reads `title`, `event_date`, `primary_sources[].{title,url,date}` and optional country/category/sector. It discards text, approval claims and metadata outside that set. A minimal alternative is shown below.

```json
{
  "title": "Frete e devoluções no Search Console",
  "source_url": "https://developers.google.com/search/blog/2025/11/more-ways-to-share-shipping",
  "source_date": "2025-11-12"
}
```

Each candidate id hashes the canonical first source URL. Keep that primary link first across exports. Campaign parameters and fragments drop out during normalization. The first accepted candidate wins; the operator can reconcile substantially different stories sharing a rolling announcement in editorial review. The Radar's word “primary” carries no authority into the editorial record. The verifier must classify source ownership and confirm the claim. Feed dates establish publication date only. A rollout or effective date requires additional evidence.

The collector reads configured publishers once per invocation, retains only article titles, URLs, provider, dates and desk labels, and includes items from the last seven days. Configured countries identify the source market. Product availability is assessed afterward. Titles containing contact details or credentials are ineligible. Clean article URLs may retain ordinary public identifiers and language selectors. Query strings used for access, signatures, or other opaque routing require a clean publisher permalink. Public HTTPS sources alone qualify. No private conversation access is required.

Three independent inputs are enabled. Google publishes the Search Central feed and GitHub publishes the Changelog RSS. IBGE provides the Brazilian News API. These publisher links document the sources.

- [Google Search Central Blog](https://developers.google.com/search/blog)
- [GitHub Changelog](https://github.blog/changelog/)
- [IBGE News API](https://servicodados.ibge.gov.br/api/docs/noticias?versao=3)

Requests carry conditional validators supplied by each publisher, a 15-second timeout and a 1.5 MB per-feed limit. On partial failure, the command writes successful candidates, preserves the failed publisher's last good validator, reports the feed id and exits nonzero. Re-running the command safely retries. Restore the previous state file when running on ephemeral runners. Deleting the cache makes the next run reread the current feed window. Every candidate id stays the same. The file lock belongs to the running process and may remain as a zero-byte companion after release; exclude it from commits and uploads.
