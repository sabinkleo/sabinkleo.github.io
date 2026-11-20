# Vértice Labs

Use an isolated branch. Inspect open PRs before changing a shared module. The Pages site serves static files. Keep the crypto simulator, its schedule, OPSEC Lab, CNAME, infrastructure settings and the sales terms in `ops/REVENUE_OS_PILOT.md` outside editorial changes.

## Editorial handoffs

| Role | Input | Decision and output |
| --- | --- | --- |
| Radar | Existing 08:00 São Paulo radar JSON, configured US/BR public feeds | Store the source URL, event or source date and title in the review queue. Deduplicate before proposing coverage. |
| Verifier | Candidate and original evidence | Check publication versus event/effective date, anchor, independence, applicability in Brazil, rights and privacy. Record verification. Bring health, law, tax and other high-risk coverage to an accountable human specialist. |
| Analyst | Verified record, scoring rubric and actual operational evidence | Identify the affected sector, give three executable actions, mark commercial hypotheses, and select an existing tool. Record what would disprove the hypothesis. |
| Editor | Verified claim, limitations and analysis | Write the Portuguese article, accessible copy and editorial history. Record approval with the scope and reviewer. Preserve original publication dates when correcting coverage. |
| Creative | Approved version of the record | Render original six-card carousel, three Stories, spoken Reel, subtitles and channel copy. Check legibility, timing and source attribution. |
| QA / Growth | Staged static site, media package, aggregate evidence | Test and review the outputs. Open the content PR. Record only measurable outcomes and cash received. Keep client records outside this public repository. |

A single operator can perform several roles. Publication requires a reviewed merge by the maintainer. Tracking, social posting, account creation and sending messages require separate authorization. Never commit private analytics exports or machine credentials. See [editorial operations](editorial/README.md).
