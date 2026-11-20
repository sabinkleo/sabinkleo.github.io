# Distribution and observed business results

## Open the review kit

Unzip the run artifact and enter the article’s media folder. Open `canais/manifest.json` for the delivery decision, text file, media paths and destination for each channel. Paths such as `carousel/01.png` start at the article’s media folder. `canais/alt.json` maps these image paths to Portuguese descriptions, and `canais/fontes.json` lists primary credits. Preserve the article’s qualifications when editing the final platform text.

| Priority | Destination | Operator handoff after editorial and account authorization |
|---|---|---|
| P0 | Pages, RSS, Google Search | Review the article, `feed.xml` and `sitemap.xml` on the PR. After deployment, a verified property owner can submit the public sitemap URL in Search Console. Indexing is a separate observable result. |
| P0 | LinkedIn, TikTok | Pick the authorized profile. LinkedIn gets an original analysis and an article link. TikTok gets the captioned MP4 and short copy, subject to confirmation of access to the existing account. |
| P0 | WhatsApp Status and voluntary sharing | Use the three vertical images for Status or paste the short text in a requested conversation. The manifest gives each path its own source tag. |
| P1 | Instagram, Facebook, Threads, YouTube Shorts | Instagram and Facebook get the ordered carousel, Reels and Shorts get the MP4, Stories gets three images for a poll and link, and Threads gets a short post. Use the generated link where the account supports a clickable destination. |
| P1 | DEV Community, Hashnode | Review the technical excerpt and set the publisher's canonical URL to the original Vértice article before any authorized syndication. |
| P2 | Pinterest, newsletter, relevant communities | Pin the cover with its alt text and destination, or review the email subject/body for an opt-in list. Share the contextual excerpt only in a discussion whose rules permit it. |
| P2 | Product Hunt, Hacker News | Drafts appear only for a `release` with a Vértice primary source at the exact tool URL. Confirm launch eligibility, an accessible demo and the venue’s submission rules. Other records show `fora_de_escopo`. |

The site, RSS and Google Search handoffs use the clean canonical URL. Other links label the source, medium and article slug. These tags carry no account, device or customer identifier. They identify an intended entry point. A forwarded link retains its tag. For social apps that restrict clickable links, check the actual profile, sticker or destination before using copy that asks a reader to open the guide.

## Access, quotas and costs checked on 2026-11-19

The delivery adapters write ordinary files offline. Generating each network's text incurs zero paid social API calls. The existing GitHub repository and Pages infrastructure supply the site and RSS. The execution uses a standard public-repository runner where standard runner compute is free under GitHub’s published policy. Storage, machine time, operator time, any paid subscriptions or future provider approvals must be accounted for separately. [GitHub Actions billing](https://docs.github.com/en/actions/concepts/billing-and-usage)

No social identity, Search Console ownership, API token, opt-in list or social publication permission has been established by the branch. Each external destination stays in manual review. An existing TikTok account mentioned by its owner supplies no API authorization. The following official access paths matter if distribution scope changes.

| Service | Permission and approval | Limits and costs |
|---|---|---|
| Search Console | A property owner can submit the sitemap in the web report. An optional API integration would need an OAuth grant for `https://www.googleapis.com/auth/webmasters` on the property. | The API is free. Sitemaps fall under other resources, currently 20 requests/s and 200/min per user. The MVP needs a single manual sitemap handoff after deployment. [Owner instructions](https://support.google.com/webmasters/answer/7451001) · [Scope](https://developers.google.com/webmaster-tools/v1/sitemaps/submit) · [Pricing](https://developers.google.com/webmaster-tools/pricing) · [Quotas](https://developers.google.com/webmaster-tools/limits) |
| LinkedIn personal profile | Share on LinkedIn requires a developer app with the product enabled plus the member’s OAuth `w_member_social` consent. Organization posting has separate access requirements. | The personal sharing product documents 150 daily requests per member and 100,000 per app. Its access page gives no per-post tariff. Confirm current product terms before considering a client. [Product, OAuth and limits](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin) |
| TikTok | Direct Post requires approved `video.publish`, account authorization and user consent. TikTok requires an audit for public posting. Its guidelines exclude private utilities that upload only to accounts operated by the team, so this use case uses manual upload. | Posting and creator caps apply; the platform indicates a typical upper limit near 15 posts per creator per day across API clients. No fixed fee is quoted in the cited guide. [Access](https://developers.tiktok.com/docs/en/content-posting-api-get-started) · [Review and usage restrictions](https://developers.tiktok.com/docs/en/content-sharing-guidelines) |
| YouTube Shorts | A future uploader would use channel OAuth with an upload scope. Unverified API projects can face private-only uploads and an audit for public visibility. | The documented default upload allocation is 100 calls/day per project. API limits are expressed as quotas. No monetary tariff is assumed. [Upload scopes and visibility](https://developers.google.com/youtube/v3/docs/videos/insert) · [Quota and audit](https://developers.google.com/youtube/data/guides/quota_and_compliance_audits) |

For Instagram, Facebook, Threads, WhatsApp, DEV, Hashnode, Pinterest, community sites and newsletter providers the implemented handoff requires the operator’s ordinary authorized publishing interface. It uses no app registration, OAuth client, messaging template or paid transport. No external API is selected for these channels.

## Measure in a private working directory

From the checkout, create a UTF-8 template outside the repository. Replace the nulls only with observed, reconciled figures. The report prints to the terminal. Keep both the aggregates and supporting evidence in the operator’s private workspace.

```powershell
python -m editorial.growth template ../vertice-metrics-private.json
python -m editorial.growth report ../vertice-metrics-private.json
```

One row represents a monthly acquisition cohort, one campaign slug and one acquisition channel from `canais/manifest.json`. Count each opportunity once, credit one channel/campaign, use `unattributed` where the origin cannot be matched and update the original row as that cohort matures. Allocate each operating minute and expense once across cohorts. Record `0` only after checking the source for the period. Leave `null` for unavailable or incomplete measurement. The report propagates missing measures through the corresponding totals.

| Fields | Evidence to use |
|---|---|
| `qualified_visits`, `engaged_reads` | Only count visits that meet a documented audience qualification or sessions with observed reading/interaction under a lawful, approved measurement method. Search Console clicks and social impressions have their own definitions. Leave these fields unknown when the observation is unavailable. |
| `tool_clicks`, `diagnostics_completed` | Record measured tool-link activations and distinct verified completions separately. A tagged URL alone measures neither. A summary that someone voluntarily sends can document that specific completion. |
| `qualified_conversations`, `proposals`, `signed_contracts`, `paid_contracts` | Use a private qualified CRM stage, a delivered proposal, a signed contract and a contract with a reconciled payment, respectively. Multiple installments on one contract count as one paid contract. A WhatsApp button click cannot establish a conversation. |
| `cash_received_cents`, `refunds_cents`, `direct_costs_cents` | Match settled cash entries and direct costs to the cohort. Include actual production, delivery, processing, distribution and support costs, in BRL cents. Enter refunds separately. Keep forecasts and invoice face values out of received cash. |
| `allocated_expenses_and_taxes_cents`, `work_minutes` | Assign applicable overhead and taxes once; avoid double-counting cash costs or refunds. Include all human research, sales, delivery and support minutes. |

The calculator first reports realized cash contribution after refunds and direct costs. It deducts allocated expenses and taxes for the operating net, then divides by all recorded human hours. This is an operating cash view of the cohort. ROI on cash spend uses direct costs plus allocated expenses and taxes as the denominator. Unknown costs, unobserved hours and zero denominators yield `null` where applicable. Shared costs and unattributed hours belong in their own row if no allocation can be supported.

The suggested next experiment uses campaign-specific observations. Twenty recorded tool clicks with zero observed completions trigger a CTA test. Five qualified conversations with zero proposals trigger a qualification review. Three proposals with zero paid contracts trigger a review of objections. These are triage thresholds for a follow-up test, not attribution estimates. No observation means no recommendation. Review the original pilot scope and accounting definitions in [the existing pilot SOP](../ops/REVENUE_OS_PILOT.md).
