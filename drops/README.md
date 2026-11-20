# Vértice Drops — public perks, not competitive intelligence

**Public URL:** https://verticelabs.me/drops/

## Promise
A small editorial collection of verified public discounts, free tools, student benefits and developer credits, based on official offer pages. **Never** publish internal business hypotheses, competitor strategy dossiers, user screenshots, API credentials, scraped leads, or private research here.

The old public `/signal-lab/` redirects to `/drops/`. No old research JSON or JavaScript is served on the current branch.

## Update an offer
1. Verify current terms on the provider's official page or an authorized partner's official page, recording the exact source and date.
2. Add an entry to `offers.json` with an official HTTPS landing URL, source URL, eligibility, conditions, `verified_at` and optional `expires_at`.
3. If no actual code is supplied and verified by the provider, **always set `coupon_code: null`**.
4. Discounts are not equivalent to free money. Label credit limits, billing traps and account eligibility precisely.
5. Expired offers are hidden automatically by the client (local date); also remove outdated records during editorial review.
6. Run `python signal-lab/validate.py` and `node --check drops/app.js`. Open a PR; CI checks both.
7. Prefer fewer well-verified offers to large catalogs full of expired or invented codes.

## Current public inventory — checked 20 November 2026
- CodeBit × AWS Kiro Power: three months subject to team eligibility and AWS approval; expires 30 November 2026.
- GitHub Education Student Developer Pack: verified students only; individual perks may change.
- AWS Free Tier: up to US$200 for eligible new AWS accounts, with specific limits.
- Gemini API Free Tier: model-dependent limits, billing/availability subject to change.

These are external offers. Vértice Labs has not asserted affiliation, ownership or coupon-code exclusivity.

## Privacy & technology
Static GitHub Pages, one small JSON file, native JavaScript, no external tracking libraries, no account creation, no cookies, no affiliate identifiers, and no back-end. The site's private strategy records are **not** synchronized to this channel.

## Next commercial step
Only after enough organic traffic and confirmed demand: consider affiliate tracking with transparent disclosure and consent, or submit verified community offers for editorial review. Do not turn a research vault into a public feed.
